package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// BrainOverviewService is the contract BrainOverviewHandler needs. The
// concrete *service.BrainStatsService implements it; tests inject a fake
// that returns a pre-built *service.BrainOverview.
type BrainOverviewService interface {
	GetOverview(ctx context.Context) (*service.BrainOverview, error)
}

// BrainOverviewHandler exposes the aggregated dashboard view assembled
// by BrainStatsService.GetOverview. It depends on a small interface so
// tests can inject a fake without spinning up the DB or the Brain MCP.
type BrainOverviewHandler struct {
	svc BrainOverviewService
}

// NewBrainOverviewHandler wires the service dependency.
func NewBrainOverviewHandler(svc BrainOverviewService) *BrainOverviewHandler {
	return &BrainOverviewHandler{svc: svc}
}

// Get godoc
// @Summary Aggregated Brain dashboard overview
// @Tags brain
func (h *BrainOverviewHandler) Get(c *gin.Context) {
	out, err := h.svc.GetOverview(c.Request.Context())
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "overview_failed", err.Error(), middleware.GetRequestID(c))
		return
	}
	c.JSON(http.StatusOK, out)
}
