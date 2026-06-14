package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// Queue is the HTTP adapter for the Queue service.
type Queue struct {
	svc *service.Queue
}

// NewQueue builds a Queue handler.
func NewQueue(s *service.Queue) *Queue { return &Queue{svc: s} }

// List GET /api/v1/facebook/content-queue
func (h *Queue) List(c *gin.Context) {
	out, err := h.svc.List(c.Request.Context())
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

type updateQueueStatusReq struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// UpdateStatus POST /api/v1/facebook/update-queue-status
//   status ∈ "READY" | "REJECTED"  (other transitions not yet supported)
func (h *Queue) UpdateStatus(c *gin.Context) {
	var req updateQueueStatusReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	var (
		out models.QueueItem
		err error
	)
	switch req.Status {
	case "READY":
		out, err = h.svc.Approve(c.Request.Context(), req.ID)
	case "REJECTED":
		out, err = h.svc.Reject(c.Request.Context(), req.ID)
	default:
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", "status must be READY or REJECTED", middleware.GetRequestID(c))
		return
	}
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "queue item not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// PublishNow POST /api/v1/facebook/publish-now
func (h *Queue) PublishNow(c *gin.Context) {
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

// Regenerate POST /api/v1/facebook/regenerate-content (AI echo stub)
func (h *Queue) Regenerate(c *gin.Context) {
	var req idOnlyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.RegenerateContent(c.Request.Context(), req.ID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "queue item not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// Delete POST /api/v1/facebook/delete-from-queue
func (h *Queue) Delete(c *gin.Context) {
	var req idOnlyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	if err := h.svc.Delete(c.Request.Context(), req.ID); err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, nil)
}
