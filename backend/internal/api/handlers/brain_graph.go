package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
)

// BrainGraphClient is the MCP subset for graph statistics. The
// concrete *mcp.BrainClient implements it.
type BrainGraphClient interface {
	QueryGraph(ctx context.Context, scope map[string]string, entityTypes []string, limit int) (*mcp.QueryGraphResult, error)
}

// BrainGraphHandler returns aggregate counts over the Brain entity
// graph: total entities, breakdown by type, and a small sample of
// the top entities. The MCP's QueryGraph is used as the data source
// because mdp-brain does not yet ship a dedicated stats endpoint.
type BrainGraphHandler struct {
	brain BrainGraphClient
	scope map[string]string
}

// NewBrainGraphHandler wires the dependency. scope may be nil — the
// handler will fall back to {"user_id": "default"}.
func NewBrainGraphHandler(brain BrainGraphClient, scope map[string]string) *BrainGraphHandler {
	if scope == nil {
		scope = map[string]string{"user_id": "default"}
	}
	return &BrainGraphHandler{brain: brain, scope: scope}
}

// BrainGraphStatsResponse is the JSON wire format for GET
// /api/v1/facebook/brain/graph/stats.
type BrainGraphStatsResponse struct {
	TotalEntities int64            `json:"total_entities"`
	ByType        map[string]int64 `json:"by_type"`
	TopEntities   []map[string]any `json:"top_entities"`
}

// Stats godoc
// @Summary Aggregate counts over the Brain entity graph
// @Tags brain
// @Param account_id query string false "Per-account scope override (SHA-1 v5 UUID of kit-account name). Empty = default BrainScope."
func (h *BrainGraphHandler) Stats(c *gin.Context) {
	resp := BrainGraphStatsResponse{ByType: map[string]int64{}}
	if h.brain == nil {
		c.JSON(http.StatusOK, resp)
		return
	}
	scope := withAccountScope(h.scope, c.Query("account_id"))
	res, err := h.brain.QueryGraph(c.Request.Context(), scope, nil, 0)
	if err != nil {
		// Brain is best-effort. The UI shows zeros; we never want a
		// transient brain outage to 5xx the dashboard.
		c.JSON(http.StatusOK, resp)
		return
	}
	byType := map[string]int64{}
	for _, e := range res.Entities {
		byType[e.Type]++
	}
	top := make([]map[string]any, 0, 5)
	for i, e := range res.Entities {
		if i >= 5 {
			break
		}
		top = append(top, map[string]any{
			"id":           e.ID,
			"type":         e.Type,
			"external_ref": e.ExternalRef,
		})
	}
	c.JSON(http.StatusOK, BrainGraphStatsResponse{
		TotalEntities: int64(len(res.Entities)),
		ByType:        byType,
		TopEntities:   top,
	})
}
