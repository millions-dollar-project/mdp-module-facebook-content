package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
)

// BrainLearningClient is the MCP subset for learning signals. The
// concrete *mcp.BrainClient implements it.
type BrainLearningClient interface {
	GetLearningState(ctx context.Context, scope map[string]string, status string, targetType string) (*mcp.GetLearningStateResult, error)
}

// BrainLearningHandler exposes the proposed-learning-signals feed and a
// stub apply endpoint. mdp-brain does not yet ship a real apply method;
// the stub acknowledges the request so the UI can show a toast while
// the brain team ships the equivalent tool.
type BrainLearningHandler struct {
	brain BrainLearningClient
	scope map[string]string
}

// NewBrainLearningHandler wires the dependency. scope may be nil — the
// handler will fall back to {"user_id": "default"}.
func NewBrainLearningHandler(brain BrainLearningClient, scope map[string]string) *BrainLearningHandler {
	if scope == nil {
		scope = map[string]string{"user_id": "default"}
	}
	return &BrainLearningHandler{brain: brain, scope: scope}
}

// List godoc
// @Summary List proposed learning signals from the Brain MCP
// @Tags brain
func (h *BrainLearningHandler) List(c *gin.Context) {
	if h.brain == nil {
		c.JSON(http.StatusOK, gin.H{"signals": []mcp.LearningSignal{}})
		return
	}
	res, err := h.brain.GetLearningState(c.Request.Context(), h.scope, "proposed", "")
	if err != nil {
		// Brain is best-effort. The UI shows an EmptyState; a transient
		// brain outage never 5xx's the dashboard.
		c.JSON(http.StatusOK, gin.H{"signals": []mcp.LearningSignal{}})
		return
	}
	if res.Signals == nil {
		res.Signals = []mcp.LearningSignal{}
	}
	c.JSON(http.StatusOK, gin.H{"signals": res.Signals})
}

// Apply godoc
// @Summary Acknowledge a learning-signal apply request
// @Tags brain
//
// NOTE: mdp-brain does not yet expose an apply method. This endpoint
// is a stub that returns 200 with a note; once the brain team ships
// the equivalent tool, route the call through it here.
func (h *BrainLearningHandler) Apply(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "missing_id", "signal id required", middleware.GetRequestID(c))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"applied":   true,
		"signal_id": id,
		"note":      "stub — mdp-brain apply not yet implemented",
	})
}
