package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// Scheduler is the HTTP adapter for the Scheduler service.
type Scheduler struct {
	svc *service.Scheduler
}

// NewScheduler builds a Scheduler handler.
func NewScheduler(s *service.Scheduler) *Scheduler { return &Scheduler{svc: s} }

// List GET /api/v1/facebook/scheduled-posts
func (h *Scheduler) List(c *gin.Context) {
	out, err := h.svc.List(c.Request.Context())
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
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
func (h *Scheduler) Schedule(c *gin.Context) {
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

// PublishNow POST /api/v1/facebook/publish-scheduled-now
func (h *Scheduler) PublishNow(c *gin.Context) {
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
func (h *Scheduler) Cancel(c *gin.Context) {
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
