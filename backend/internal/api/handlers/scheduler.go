package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// SchedulerLister is the surface of repo.SchedulerRepo the Kanban
// list endpoint needs. The handler depends on the narrow interface
// (not the whole *Scheduler service) so tests can stub the
// list-join with a fake.
type SchedulerLister interface {
	ListForKanban(ctx context.Context, statusFilter string, kitAccountID string, limit, offset int32) ([]repo.KanbanRow, error)
}

// SchedulerHandler is the HTTP adapter for the Scheduler service.
// Renamed from the prior `Scheduler` so it doesn't shadow
// *service.Scheduler when the router wires it up.
type SchedulerHandler struct {
	svc   *service.Scheduler
	repo  SchedulerLister
	logFn func(string, ...any)
}

// NewScheduler builds a Scheduler handler bound to the given
// Scheduler service. lister may be nil — the enriched list endpoint
// returns 503 in that case.
func NewScheduler(s *service.Scheduler, lister SchedulerLister) *SchedulerHandler {
	return &SchedulerHandler{svc: s, repo: lister}
}

// kanbanRowJSON is the wire shape for List. The repo returns
// repo.KanbanRow (which embeds models.ScheduledPost + enrichment
// fields); the handler flattens it into a single object the UI can
// consume without having to chase an embedded struct.
type kanbanRowJSON struct {
	models.ScheduledPost
	BrainDraftID  string            `json:"brainDraftId,omitempty"`
	PersonaID     string            `json:"personaId,omitempty"`
	FeedContent   string            `json:"feedContent,omitempty"`
	Thumbnail     string            `json:"thumbnail,omitempty"`
	FeedMediaURLs []string          `json:"feedMediaUrls,omitempty"`
}

// List GET /api/v1/facebook/scheduled-posts
//
// Query params (all optional):
//
//	status     - filter by schedule status (e.g. SCHEDULED). Comma-
//	             separated list runs as N separate queries and is
//	             unioned in memory. Empty = no filter.
//	accountId  - kit account UUID (SHA-1 v5). Empty = no filter.
//	limit      - max rows (default 50, capped at 200).
//	offset     - pagination offset (default 0).
func (h *SchedulerHandler) List(c *gin.Context) {
	if h.repo == nil {
		WriteError(c.Writer, c.Request, http.StatusServiceUnavailable, "unavailable", "scheduler list not configured", middleware.GetRequestID(c))
		return
	}
	ctx := c.Request.Context()
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if offset < 0 {
		offset = 0
	}
	statusFilter := c.Query("status")
	accountID := c.Query("accountId")
	statuses := splitStatuses(statusFilter)

	var rows []repo.KanbanRow
	for _, st := range statuses {
		batch, err := h.repo.ListForKanban(ctx, st, accountID, int32(limit), int32(offset))
		if err != nil {
			WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
			return
		}
		rows = append(rows, batch...)
	}
	if rows == nil {
		rows = []repo.KanbanRow{}
	}
	out := make([]kanbanRowJSON, 0, len(rows))
	for _, r := range rows {
		var media []string
		if len(r.FeedMediaURLs) > 0 {
			_ = unmarshalStringSlice(r.FeedMediaURLs, &media)
		}
		out = append(out, kanbanRowJSON{
			ScheduledPost: r.ScheduledPost,
			BrainDraftID:  r.BrainDraftID,
			PersonaID:     r.PersonaID,
			FeedContent:   r.FeedContent,
			Thumbnail:     r.Thumbnail,
			FeedMediaURLs: media,
		})
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

// splitStatuses turns "SCHEDULED,PUBLISHING" into ["SCHEDULED",
// "PUBLISHING"] and "all" / "" into [""]. The repo interprets
// empty as "no filter". We don't UNION in SQL because the index
// (kit_account_id) and the volume per status are small enough that
// a couple of round-trips are cheaper than a complex IN list.
func splitStatuses(raw string) []string {
	if raw == "" {
		return []string{""}
	}
	if raw == "all" {
		return []string{""}
	}
	out := []string{}
	start := 0
	for i := 0; i < len(raw); i++ {
		if raw[i] == ',' {
			s := raw[start:i]
			if s != "" {
				out = append(out, s)
			}
			start = i + 1
		}
	}
	if tail := raw[start:]; tail != "" {
		out = append(out, tail)
	}
	if len(out) == 0 {
		return []string{""}
	}
	return out
}

func unmarshalStringSlice(b []byte, out *[]string) error {
	if len(b) == 0 {
		return nil
	}
	// The repo stores the jsonb as raw bytes; the column can be
	// either an array of strings (the common case) or null.
	if string(b) == "null" {
		return nil
	}
	// Use encoding/json indirectly through the json package.
	// Imported via models' json.RawMessage we can re-marshal into
	// the typed slice.
	return json.Unmarshal(b, out)
}

// schedulePostReq is the JSON body for POST /schedule-post.
// `PageID` is the *Facebook* page id (matches PagesTab UI); the service
// resolves it to the local uuid.
type schedulePostReq struct {
	PageID      string    `json:"pageId"`
	Content     string    `json:"content"`
	ScheduledAt time.Time `json:"scheduledAt"`
}

// Schedule POST /api/v1/facebook/schedule-post
func (h *SchedulerHandler) Schedule(c *gin.Context) {
	var req schedulePostReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.Schedule(c.Request.Context(), req.PageID, req.Content, req.ScheduledAt)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", err.Error(), middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// rescheduleReq is the JSON body for POST /reschedule-scheduled-post.
// postType is asserted server-side so a UI bug can't reschedule a
// personal row through the fanpage handler (or vice versa).
type rescheduleReq struct {
	ID          string    `json:"id"          binding:"required"`
	ScheduledAt time.Time `json:"scheduledAt" binding:"required"`
	PostType    string    `json:"postType"    binding:"required"`
}

// Reschedule POST /api/v1/facebook/reschedule-scheduled-post
func (h *SchedulerHandler) Reschedule(c *gin.Context) {
	var req rescheduleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.Reschedule(c.Request.Context(), req.ID, models.PostType(req.PostType), req.ScheduledAt)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "scheduled post not found or already started", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// PublishNow POST /api/v1/facebook/publish-scheduled-now
func (h *SchedulerHandler) PublishNow(c *gin.Context) {
	var req idOnlyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.PublishNow(c.Request.Context(), req.ID)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// Cancel POST /api/v1/facebook/cancel-schedule
func (h *SchedulerHandler) Cancel(c *gin.Context) {
	var req idOnlyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.Cancel(c.Request.Context(), req.ID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "scheduled post not found or already started", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}
