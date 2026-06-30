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
	svc   BrainOverviewService
	scope map[string]string
}

// NewBrainOverviewHandler wires the service dependency. scope may be
// nil — the handler falls back to {"user_id": "default"}.
func NewBrainOverviewHandler(svc BrainOverviewService, scope map[string]string) *BrainOverviewHandler {
	if scope == nil {
		scope = map[string]string{"user_id": "default"}
	}
	return &BrainOverviewHandler{svc: svc, scope: scope}
}

// Get godoc
// @Summary Aggregated Brain dashboard overview
// @Tags brain
// @Param account_id query string false "Per-account scope override (SHA-1 v5 UUID of kit-account name). Empty = default BrainScope."
func (h *BrainOverviewHandler) Get(c *gin.Context) {
	// Resolve per-request scope: account_id overrides the constructor-time
	// scope so each kit-account sees its own counts. Without this, all
	// accounts would share the global dashboard numbers.
	scope := withAccountScope(h.scope, c.Query("account_id"))
	out, err := h.svc.GetOverviewWithScope(c.Request.Context(), scope)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "overview_failed", err.Error(), middleware.GetRequestID(c))
		return
	}
	c.JSON(http.StatusOK, out)
}
