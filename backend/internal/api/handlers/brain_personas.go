package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
)

// BrainPersonasClient is the MCP subset for listing persona entities.
// mdp-brain doesn't yet expose list_profiles; until it does, this
// handler falls back to QueryGraph with entity_type="profile" and the
// UI shows an EmptyState when nothing is returned.
type BrainPersonasClient interface {
	QueryGraph(ctx context.Context, scope map[string]string, entityTypes []string, limit int) (*mcp.QueryGraphResult, error)
}

// BrainPersonasHandler returns the list of personas known to the Brain
// MCP. The default scope is the synthetic "default" user id; once auth
// is wired in, swap that for the caller's id.
type BrainPersonasHandler struct {
	brain BrainPersonasClient
	scope map[string]string
}

// NewBrainPersonasHandler wires the dependency. scope may be nil — the
// handler will fall back to {"user_id": "default"}.
func NewBrainPersonasHandler(brain BrainPersonasClient, scope map[string]string) *BrainPersonasHandler {
	if scope == nil {
		scope = map[string]string{"user_id": "default"}
	}
	return &BrainPersonasHandler{brain: brain, scope: scope}
}

// BrainPersonaItem is the JSON wire format for one persona row.
type BrainPersonaItem struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	ExternalRef string `json:"external_ref,omitempty"`
}

// List godoc
// @Summary List persona entities known to the Brain MCP
// @Tags brain
// @Param account_id query string false "Per-account scope override (SHA-1 v5 UUID of kit-account name). Empty = default BrainScope."
func (h *BrainPersonasHandler) List(c *gin.Context) {
	if h.brain == nil {
		c.JSON(http.StatusOK, gin.H{"personas": []BrainPersonaItem{}})
		return
	}
	scope := withAccountScope(h.scope, c.Query("account_id"))
	res, err := h.brain.QueryGraph(c.Request.Context(), scope, []string{"profile"}, 50)
	if err != nil {
		// Brain is best-effort. The UI shows an EmptyState; we never
		// want a transient brain outage to 5xx the dashboard.
		c.JSON(http.StatusOK, gin.H{"personas": []BrainPersonaItem{}})
		return
	}
	out := make([]BrainPersonaItem, 0, len(res.Entities))
	for _, e := range res.Entities {
		out = append(out, BrainPersonaItem{
			ID:          e.ID,
			Type:        e.Type,
			ExternalRef: e.ExternalRef,
		})
	}
	c.JSON(http.StatusOK, gin.H{"personas": out})
}
