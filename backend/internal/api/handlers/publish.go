package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// Publish is the HTTP adapter for the immediate-publish endpoint,
// POST /api/v1/facebook/publish. The body is snake_case (per
// plugin/src/lib/api.ts convention for this single endpoint) and
// represents the ComposeTab's "Đăng ngay" submission.
type Publish struct {
	pages     repo.PagesRepo
	scheduler *service.Scheduler
}

// NewPublish builds a Publish handler.
func NewPublish(p repo.PagesRepo, s *service.Scheduler) *Publish {
	return &Publish{pages: p, scheduler: s}
}

// publishReq is the request body, snake_case. `ScheduledAt` is a
// pointer because it's optional — nil means "publish now".
type publishReq struct {
	Content    string     `json:"content"`
	MediaURLs  []string   `json:"media_urls"`
	PageIDs    []string   `json:"page_ids"`
	Link       string     `json:"link,omitempty"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
}

// Publish POST /api/v1/facebook/publish
//   - If scheduled_at is provided: creates a SCHEDULED row, returns
//     {id, status: "SCHEDULED"}.
//   - Otherwise: looks up the first page, publishes immediately via the
//     Scheduler.PublishNow path, returns {id, status: "PUBLISHED"}.
//
// Phase 3 will lift the single-page limitation.
func (h *Publish) Publish(c *gin.Context) {
	var req publishReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	if req.Content == "" {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", "content is required", middleware.GetRequestID(c))
		return
	}
	if len(req.PageIDs) == 0 {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", "page_ids is required", middleware.GetRequestID(c))
		return
	}
	ctx := c.Request.Context()

	if req.ScheduledAt != nil {
		// Schedule path — pick the first page id.
		row, err := h.scheduler.Schedule(ctx, req.PageIDs[0], req.Content, *req.ScheduledAt)
		if err != nil {
			WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
			return
		}
		_ = WriteJSON(c.Writer, http.StatusOK, models.PublishResult{ID: row.ID, Status: string(models.ScheduleStatusScheduled)})
		return
	}

	// Immediate path — publish to the first page only (Phase 3: loop).
	page, err := h.pages.GetByFBID(ctx, req.PageIDs[0])
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "page not registered", middleware.GetRequestID(c))
		return
	}
	// Reuse the scheduler's publish-now for parity with the Scheduler tab.
	row, err := h.scheduler.Schedule(ctx, page.PageID, req.Content, time.Now().UTC().Add(1*time.Second))
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	// Immediately publish.
	published, err := h.scheduler.PublishNow(ctx, row.ID)
	if err != nil {
		_ = WriteJSON(c.Writer, http.StatusOK, models.PublishResult{ID: row.ID, Status: "FAILED"})
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, models.PublishResult{ID: published.ID, Status: string(published.Status)})
}
