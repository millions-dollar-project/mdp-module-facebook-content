package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
)

// BrainFeedbackClient is the MCP subset for recording review feedback.
// The concrete *mcp.BrainClient implements it.
type BrainFeedbackClient interface {
	RecordFeedback(ctx context.Context, in mcp.RecordFeedbackInput) (*mcp.RecordFeedbackResult, error)
}

// BrainFeedbackHandler proxies approve/reject/edit decisions back to
// the Brain MCP. The handler is intentionally thin: the validation is
// "provenance_id and action are non-empty"; richer rules live in
// the brain itself.
type BrainFeedbackHandler struct {
	brain BrainFeedbackClient
}

// NewBrainFeedbackHandler wires the dependency.
func NewBrainFeedbackHandler(brain BrainFeedbackClient) *BrainFeedbackHandler {
	return &BrainFeedbackHandler{brain: brain}
}

// Create godoc
// @Summary Record a review decision for a draft's provenance
// @Tags brain
func (h *BrainFeedbackHandler) Create(c *gin.Context) {
	if h.brain == nil {
		WriteError(c.Writer, c.Request, http.StatusServiceUnavailable, "feedback_unavailable", "brain not configured", middleware.GetRequestID(c))
		return
	}
	var in mcp.RecordFeedbackInput
	if err := c.ShouldBindJSON(&in); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_body", err.Error(), middleware.GetRequestID(c))
		return
	}
	if in.ProvenanceID == "" || in.Action == "" {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "missing_fields", "provenance_id and action required", middleware.GetRequestID(c))
		return
	}
	res, err := h.brain.RecordFeedback(c.Request.Context(), in)
	if err != nil {
		// Brain is upstream of the dashboard; an MCP failure is best
		// modelled as 502 Bad Gateway rather than 500.
		WriteError(c.Writer, c.Request, http.StatusBadGateway, "feedback_failed", err.Error(), middleware.GetRequestID(c))
		return
	}
	c.JSON(http.StatusOK, res)
}
