package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// BrainScheduleGenerator is the surface of BrainFeedService.Generate
// the batch endpoint needs.
type BrainScheduleGenerator interface {
	Generate(ctx context.Context, feedIDs []string, personaID string) ([]models.BrainDraftRow, []models.GenerateFailure, error)
}

// PersonalScheduler is the surface of Scheduler.SchedulePersonal
// the batch endpoint needs. Kept narrow so a unit test can stub
// either side independently.
type PersonalScheduler interface {
	SchedulePersonal(ctx context.Context, accountID string, content string, scheduledAt time.Time, mediaURLs []string) (models.ScheduledPost, error)
}

// BrainDraftBinder binds the brain_drafts row to its scheduled row
// (sets kanban_job_id). Production uses repo.BrainDraftRepo.
type BrainDraftBinder interface {
	MarkPushedRow(ctx context.Context, id string, kanbanJobID string) error
}

// KitAccountResolver is the surface of KitLoader.LookupByUUID that
// pre-flights the kit account exists before we issue N schedule
// inserts. Returning an error here short-circuits the whole batch
// with 404.
type KitAccountResolver interface {
	LookupByUUID(ctx context.Context, id string) (exists bool, err error)
}

// BrainScheduleHandler owns POST /brain/generate-and-schedule. The
// shape: pick a list of feed ids + a persona + a parallel list of
// scheduled times; the handler runs BrainFeedService.Generate, then
// for each (feed, slot) pair inserts a scheduled_posts row with
// post_type='personal' and binds the resulting draft row to it via
// kanban_job_id. Per-slot failures are reported in the response
// without aborting the whole batch.
type BrainScheduleHandler struct {
	gen      BrainScheduleGenerator
	sched    PersonalScheduler
	binder   BrainDraftBinder
	accounts KitAccountResolver
}

// NewBrainScheduleHandler wires the four deps. Any may be nil — the
// handler returns 503 when called on a nil service.
func NewBrainScheduleHandler(gen BrainScheduleGenerator, sched PersonalScheduler, binder BrainDraftBinder, accounts KitAccountResolver) *BrainScheduleHandler {
	return &BrainScheduleHandler{gen: gen, sched: sched, binder: binder, accounts: accounts}
}

type generateAndScheduleReq struct {
	FeedIDs   []string  `json:"feedIds"   binding:"required"`
	PersonaID string    `json:"personaId" binding:"required"`
	AccountID string    `json:"accountId" binding:"required"`
	Slots     []slotDTO `json:"slots"     binding:"required"`
}

type slotDTO struct {
	ScheduledAt time.Time `json:"scheduledAt"`
}

type draftResult struct {
	FeedID string `json:"feedId"`
	DraftID string `json:"draftId"`
	Status  string `json:"status"`
}

type scheduleResult struct {
	FeedID          string    `json:"feedId"`
	ScheduledPostID string    `json:"scheduledPostId"`
	ScheduledAt     time.Time `json:"scheduledAt"`
}

type failureResult struct {
	FeedID  string `json:"feedId"`
	Stage   string `json:"stage"`  // "draft" or "schedule"
	Message string `json:"message"`
}

// GenerateAndSchedule godoc
// @Summary Generate an AI draft per feed id and schedule each one
// @Description Runs BrainFeedService.Generate on the provided feed ids
// @Description (using the supplied persona) and inserts one personal-profile
// @Description scheduled_posts row per slot. Per-feed failures (either at the
// @Description draft step or the schedule step) are returned in `failures`
// @Description rather than aborting the batch.
// @Tags brain
func (h *BrainScheduleHandler) GenerateAndSchedule(c *gin.Context) {
	if h.gen == nil || h.sched == nil || h.accounts == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    "service_unavailable",
			"message": "brain schedule service not configured",
		})
		return
	}
	var req generateAndScheduleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "bad_request", "message": err.Error()})
		return
	}
	if len(req.FeedIDs) == 0 || len(req.Slots) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "feed_ids_and_slots_required",
			"message": "feedIds and slots are required and must be non-empty",
		})
		return
	}
	if len(req.FeedIDs) != len(req.Slots) {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "feed_slot_mismatch",
			"message": "feedIds and slots must have the same length",
		})
		return
	}
	if req.PersonaID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "persona_required",
			"message": "personaId is required",
		})
		return
	}
	if req.AccountID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "account_required",
			"message": "accountId is required",
		})
		return
	}
	// Pre-flight the kit account so the caller gets a clean 404
	// instead of N schedule failures that all share the same root
	// cause.
	ok, err := h.accounts.LookupByUUID(c.Request.Context(), req.AccountID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    "kit_account_not_found",
			"message": err.Error(),
		})
		return
	}
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    "kit_account_not_found",
			"message": "kit account not found for accountId " + req.AccountID,
		})
		return
	}

	ctx := c.Request.Context()
	// Step 1: generate drafts. The handler ignores the per-draft
	// content for now and re-derives it from the feed id ↔ draft
	// mapping. A failure here means no draft was produced and we
	// still insert a placeholder schedule row so the Kanban shows
	// the slot with a "brain-blocked" content so the user sees
	// what went wrong instead of a silent miss.
	drafts, genFailures, err := h.gen.Generate(ctx, req.FeedIDs, req.PersonaID)
	if err != nil && len(drafts) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "generate_failed",
			"message": err.Error(),
		})
		return
	}

	draftsByFeed := make(map[string]models.BrainDraftRow, len(drafts))
	for _, d := range drafts {
		draftsByFeed[d.FeedID] = d
	}

	// Per-feed GenerateFailure list (kept separately from
	// genFailures because we want a stable FeedID-indexed view).
	genFailureByFeed := make(map[string]string, len(genFailures))
	for _, f := range genFailures {
		genFailureByFeed[f.FeedID] = f.Err
	}

	var (
		outDrafts    []draftResult
		outSchedules []scheduleResult
		outFailures  []failureResult
	)
	for i, feedID := range req.FeedIDs {
		slot := req.Slots[i].ScheduledAt
		draft, hasDraft := draftsByFeed[feedID]
		if !hasDraft {
			msg := "brain generate returned no draft for this feed"
			if m, ok := genFailureByFeed[feedID]; ok && m != "" {
				msg = m
			}
			// Still insert a placeholder schedule so the slot
			// shows up on the Kanban. Content starts with the
			// brain-blocked marker the UI greys out.
			placeholder := "# brain-blocked: " + msg
			row, sErr := h.sched.SchedulePersonal(ctx, req.AccountID, placeholder, slot, nil)
			if sErr != nil {
				outFailures = append(outFailures, failureResult{
					FeedID: feedID, Stage: "schedule", Message: sErr.Error(),
				})
				continue
			}
			outSchedules = append(outSchedules, scheduleResult{
				FeedID: feedID, ScheduledPostID: row.ID, ScheduledAt: row.ScheduledAt,
			})
			outFailures = append(outFailures, failureResult{
				FeedID: feedID, Stage: "draft", Message: msg,
			})
			continue
		}
		// Happy path: schedule the draft content and bind it.
		row, sErr := h.sched.SchedulePersonal(ctx, req.AccountID, draft.Content, slot, nil)
		if sErr != nil {
			outFailures = append(outFailures, failureResult{
				FeedID: feedID, Stage: "schedule", Message: sErr.Error(),
			})
			continue
		}
		if h.binder != nil {
			if bErr := h.binder.MarkPushedRow(ctx, draft.ID, row.ID); bErr != nil {
				outFailures = append(outFailures, failureResult{
					FeedID: feedID, Stage: "schedule",
					Message: "failed to bind kanban_job_id: " + bErr.Error(),
				})
			}
		}
		outDrafts = append(outDrafts, draftResult{
			FeedID: feedID, DraftID: draft.ID, Status: draft.Status,
		})
		outSchedules = append(outSchedules, scheduleResult{
			FeedID: feedID, ScheduledPostID: row.ID, ScheduledAt: row.ScheduledAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"drafts":    outDrafts,
		"schedules": outSchedules,
		"failures":  outFailures,
	})
}
