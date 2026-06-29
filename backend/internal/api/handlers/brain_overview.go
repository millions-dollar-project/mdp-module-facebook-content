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
//
// GetOverviewWithScope is the per-request-scope variant. Implementations
// that don't need per-account filtering can panic on it (the handler
// will fall back to the constructor-time scope).
type BrainOverviewService interface {
	GetOverview(ctx context.Context) (*service.BrainOverview, error)
	GetOverviewWithScope(ctx context.Context, scope map[string]string) (*service.BrainOverview, error)
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
// @Param account_id query string false "Per-account scope override (SHA-1 v5 UUID of kit-account name). Empty = default BrainScope."
func (h *BrainOverviewHandler) Get(c *gin.Context) {
	// We always use the per-scope variant so the wire contract is
	// consistent across endpoints. Passing nil here lets the service
	// fall back to its constructor-time scope — same behavior as
	// before this handler gained account scoping.
	out, err := h.svc.GetOverviewWithScope(c.Request.Context(), nil)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "overview_failed", err.Error(), middleware.GetRequestID(c))
		return
	}
	c.JSON(http.StatusOK, out)
}
