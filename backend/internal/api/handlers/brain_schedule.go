package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// MaxContextFeeds caps how many of the newest brain_feeds rows the
// handler will pull as style context before generating drafts. 50 is
// plenty for "10 crawled posts → 3 drafts" use cases and bounds the
// upstream AI cost if a user has been crawling for a while.
const MaxContextFeeds = 50

// MaxDraftsPerRequest is the hard upper bound for the `numDrafts`
// field. 50 matches MaxContextFeeds; you cannot ask for more drafts
// than we have context feeds (and there is no value in doing so).
const MaxDraftsPerRequest = 50

// MinDraftsPerRequest is the lower bound for `numDrafts`. A user must
// always ask for at least one draft — submitting 0 is almost always
// a UI bug and silently no-ops, which is worse than a 400.
const MinDraftsPerRequest = 1

// BrainScheduleGenerator is the surface of BrainFeedService.Generate
// the batch endpoint needs.
type BrainScheduleGenerator interface {
	Generate(ctx context.Context, feedIDs []string, personaID string) ([]models.BrainDraftRow, []models.GenerateFailure, error)
}

// BrainFeedContextLister is the surface of BrainFeedService.ListNewest
// the batch endpoint needs to pull the latest crawled feeds as style
// context for the AI. We deliberately keep this narrow (accountId +
// limit) so the unit test can stub it with a small in-memory map.
type BrainFeedContextLister interface {
	// ListNewest returns up to `limit` brain_feeds rows ordered by
	// created_at DESC. Used as the style-context input for the
	// AI draft generator.
	ListNewest(ctx context.Context, accountID string, limit int) ([]models.BrainFeedRow, error)
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

// BrainScheduleHandler owns POST /brain/generate-and-schedule.
//
// Flow (confirmed with user 2026-06-30):
//   1. User has crawled N posts (already in brain_feeds — the data
//      is the style/context input, NOT the output).
//   2. User opens the popup, picks a persona, chooses how many
//      drafts to create (numDrafts, 1..50) and provides one custom
//      scheduled time per draft. Times are fully free-form (no
//      auto-spacing) — the user might pick 10:01, 10:02, 14:30
//      depending on their audience.
//   3. Handler pulls the top-N newest feeds (up to MaxContextFeeds)
//      as context and asks BrainFeedService.Generate to produce
//      drafts from each.
//   4. We keep the first numDrafts drafts (one per slot) and
//      schedule them via Scheduler.SchedulePersonal.
//   5. BrainDraftRepo.MarkPushedRow binds kanban_job_id for the
//      Kanban tab.
//
// Per-slot failures (draft gen failed or schedule insert failed)
// are reported in `failures` rather than aborting the batch.
type BrainScheduleHandler struct {
	gen      BrainScheduleGenerator
	lister   BrainFeedContextLister
	sched    PersonalScheduler
	binder   BrainDraftBinder
	accounts KitAccountResolver
}

// NewBrainScheduleHandler wires the five deps. lister and binder may
// be nil in degraded test setups; the handler will return 503 when
// called without them.
func NewBrainScheduleHandler(
	gen BrainScheduleGenerator,
	lister BrainFeedContextLister,
	sched PersonalScheduler,
	binder BrainDraftBinder,
	accounts KitAccountResolver,
) *BrainScheduleHandler {
	return &BrainScheduleHandler{gen: gen, lister: lister, sched: sched, binder: binder, accounts: accounts}
}

type generateAndScheduleReq struct {
	// NumDrafts is the number of NEW drafts to produce. The handler
	// pulls the top-N newest feeds from brain_feeds (as style
	// context) but the OUTPUT is exactly numDrafts scheduled posts.
	// We deliberately do NOT use the `required` binding tag — gin's
	// required would reject 0 with a generic "field required" error
	// and we want a specific "out_of_range" code instead.
	NumDrafts int       `json:"numDrafts"`
	ModelID   string    `json:"modelId" binding:"required"`
	AccountID string    `json:"accountId" binding:"required"`
	Slots     []slotDTO `json:"slots"     binding:"required"`
}

type slotDTO struct {
	ScheduledAt time.Time `json:"scheduledAt"`
}

type draftResult struct {
	DraftID string `json:"draftId"`
	FeedID  string `json:"feedId"`
	Status  string `json:"status"`
}

type scheduleResult struct {
	ScheduledPostID string    `json:"scheduledPostId"`
	ScheduledAt     time.Time `json:"scheduledAt"`
}

type failureResult struct {
	Index   int    `json:"index"`             // 0-based index in the request's slots array
	Stage   string `json:"stage"`             // "draft" or "schedule"
	Message string `json:"message"`
}

// GenerateAndSchedule godoc
// @Summary Generate numDrafts AI drafts and schedule them at custom times
// @Description Pulls the newest crawled feeds from brain_feeds as style
// @Description context, generates NumDrafts drafts via mdp-brain, then
// @Description schedules each at the user-provided scheduledAt time
// @Description (one per slot, no auto-spacing). Per-slot failures are
// @Description reported in `failures`.
// @Tags brain
func (h *BrainScheduleHandler) GenerateAndSchedule(c *gin.Context) {
	if h.gen == nil || h.lister == nil || h.sched == nil || h.accounts == nil {
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
	if req.NumDrafts < MinDraftsPerRequest || req.NumDrafts > MaxDraftsPerRequest {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "num_drafts_out_of_range",
			"message": "numDrafts must be between 1 and 50",
		})
		return
	}
	if len(req.Slots) != req.NumDrafts {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "num_drafts_slot_mismatch",
			"message": "slots length must equal numDrafts (one custom time per draft)",
		})
		return
	}
	if req.ModelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "model_required",
			"message": "modelId is required",
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
	// Reject past-time slots upfront. We do this here (not in the
	// service) so the user sees a single clear 400 instead of N
	// "schedule_failed" entries in `failures`.
	now := time.Now()
	for i, s := range req.Slots {
		if s.ScheduledAt.Before(now) {
			c.JSON(http.StatusBadRequest, gin.H{
				"code":    "slot_in_past",
				"message": "slot[" + itoa(i) + "] scheduledAt is in the past",
			})
			return
		}
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

	// Step 1: pull newest feeds as style context. We always cap at
	// MaxContextFeeds (50) and never more than NumDrafts — there is
	// no point feeding 50 context feeds to the AI if the user only
	// asked for 3 drafts.
	contextLimit := req.NumDrafts
	if contextLimit > MaxContextFeeds {
		contextLimit = MaxContextFeeds
	}
	feeds, err := h.lister.ListNewest(ctx, req.AccountID, contextLimit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "list_feeds_failed",
			"message": err.Error(),
		})
		return
	}
	if len(feeds) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    "no_crawled_feeds",
			"message": "no crawled feeds available — crawl at least 1 post first",
		})
		return
	}
	contextFeedIDs := make([]string, 0, len(feeds))
	for _, f := range feeds {
		contextFeedIDs = append(contextFeedIDs, f.ID)
	}

	// Step 2: ask the AI to generate drafts. We always request up to
	// NumDrafts drafts (one per context feed, up to contextLimit).
	// If the AI returns fewer (e.g. some feeds blocked), we surface
	// per-slot failures for the gaps.
	drafts, genFailures, err := h.gen.Generate(ctx, contextFeedIDs, req.ModelID)
	if err != nil && len(drafts) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    "generate_failed",
			"message": err.Error(),
		})
		return
	}

	// Per-feed GenerateFailure list keyed by feed id so we can map
	// back to slots.
	genFailureByFeed := make(map[string]string, len(genFailures))
	for _, f := range genFailures {
		genFailureByFeed[f.FeedID] = f.Err
	}

	var (
		outDrafts    []draftResult
		outSchedules []scheduleResult
		outFailures  []failureResult
	)
	// We schedule drafts in the order they come back from Generate.
	// If the AI produces more drafts than numDrafts (unlikely but
	// possible) we cap at numDrafts. If it produces fewer, the
	// remaining slots get a placeholder schedule + failure entry.
	drafts = trimDrafts(drafts, req.NumDrafts)

	for i, slot := range req.Slots {
		var (
			content  string
			draftID  string
			draftSt  string
			hasDraft bool
		)
		if i < len(drafts) {
			d := drafts[i]
			content = d.Content
			draftID = d.ID
			draftSt = d.Status
			hasDraft = true
		} else {
			// No draft available for this slot. Use a
			// placeholder so the Kanban still shows the row
			// with a clear "brain-blocked" marker.
			msg := "brain generate did not return a draft for this slot"
			if len(genFailureByFeed) > 0 {
				// Pick the first failure's message —
				// users get the most recent error from
				// the upstream AI.
				for _, m := range genFailureByFeed {
					msg = m
					break
				}
			}
			content = "# brain-blocked: " + msg
		}

		row, sErr := h.sched.SchedulePersonal(ctx, req.AccountID, content, slot.ScheduledAt, nil)
		if sErr != nil {
			outFailures = append(outFailures, failureResult{
				Index: i, Stage: "schedule", Message: sErr.Error(),
			})
			continue
		}
		outSchedules = append(outSchedules, scheduleResult{
			ScheduledPostID: row.ID, ScheduledAt: row.ScheduledAt,
		})
		if hasDraft {
			outDrafts = append(outDrafts, draftResult{
				DraftID: draftID, FeedID: drafts[i].FeedID, Status: draftSt,
			})
			if h.binder != nil {
				if bErr := h.binder.MarkPushedRow(ctx, draftID, row.ID); bErr != nil {
					outFailures = append(outFailures, failureResult{
						Index:   i,
						Stage:   "schedule",
						Message: "failed to bind kanban_job_id: " + bErr.Error(),
					})
				}
			}
		} else {
			outFailures = append(outFailures, failureResult{
				Index: i, Stage: "draft", Message: content,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"drafts":    outDrafts,
		"schedules": outSchedules,
		"failures":  outFailures,
	})
}

// trimDrafts returns at most `n` drafts, preserving the original
// order. Defensive — Generate is supposed to return len(feedIDs)
// drafts but in degraded paths it might return more.
func trimDrafts(drafts []models.BrainDraftRow, n int) []models.BrainDraftRow {
	if n <= 0 || len(drafts) <= n {
		return drafts
	}
	return drafts[:n]
}

// itoa is a tiny stdlib-free int → string helper so we don't pull
// strconv just for the one error message above.
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}
