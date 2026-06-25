package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// BrainPeekClient is the MCP subset for provenance lookup. The
// concrete *mcp.BrainClient implements it.
type BrainPeekClient interface {
	GetProvenance(ctx context.Context, id string) (*mcp.GetProvenanceResult, error)
}

// BrainPeekFeedStore is the FB-side DB subset for feed lookups. The
// concrete *repo.BrainFeedRepo implements it.
type BrainPeekFeedStore interface {
	GetByIDRow(ctx context.Context, id string) (models.BrainFeedRow, error)
}

// BrainPeekDraftStore is the FB-side DB subset for draft lookups. The
// concrete *repo.BrainDraftRepo implements it.
type BrainPeekDraftStore interface {
	ListByFeedIDRow(ctx context.Context, feedID string) ([]models.BrainDraftRow, error)
}

// BrainPeekHandler returns the full provenance + drafts + feed context
// for a given feed id. It is used by the dashboard's "Peek" drawer to
// surface the upstream reasoning for a generated draft.
type BrainPeekHandler struct {
	feeds  BrainPeekFeedStore
	drafts BrainPeekDraftStore
	brain  BrainPeekClient
}

// NewBrainPeekHandler wires the three dependencies. drafts and brain
// may be nil; the handler will surface a warning and continue with the
// pieces it could fetch.
func NewBrainPeekHandler(feeds BrainPeekFeedStore, drafts BrainPeekDraftStore, brain BrainPeekClient) *BrainPeekHandler {
	return &BrainPeekHandler{feeds: feeds, drafts: drafts, brain: brain}
}

// BrainPeekResponse is the JSON wire format for GET
// /api/v1/facebook/brain/provenance/:id.
type BrainPeekResponse struct {
	FeedID     string                   `json:"feed_id"`
	Feed       *models.BrainFeedRow     `json:"feed,omitempty"`
	Drafts     []models.BrainDraftRow   `json:"drafts"`
	Provenance *mcp.GetProvenanceResult `json:"provenance,omitempty"`
	Warnings   []string                 `json:"warnings,omitempty"`
}

// Get godoc
// @Summary Look up the full provenance for a brain feed (feed + drafts + provenance)
// @Tags brain
func (h *BrainPeekHandler) Get(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "missing_id", "feed id required", middleware.GetRequestID(c))
		return
	}
	resp := BrainPeekResponse{FeedID: id, Drafts: []models.BrainDraftRow{}}
	var warnings []string

	if h.feeds != nil {
		if feed, err := h.feeds.GetByIDRow(c.Request.Context(), id); err == nil {
			resp.Feed = &feed
		} else {
			warnings = append(warnings, "feed_lookup: "+err.Error())
		}
	}

	if h.drafts != nil {
		drafts, err := h.drafts.ListByFeedIDRow(c.Request.Context(), id)
		if err == nil {
			resp.Drafts = drafts
		} else {
			warnings = append(warnings, "drafts_lookup: "+err.Error())
		}

		// Surface provenance for the first draft that has one. The MCP
		// only returns a single provenance per call.
		if h.brain != nil {
			for _, d := range drafts {
				if d.ProvenanceID == "" {
					continue
				}
				prov, err := h.brain.GetProvenance(c.Request.Context(), d.ProvenanceID)
				if err != nil {
					warnings = append(warnings, "provenance: "+err.Error())
				} else {
					resp.Provenance = prov
				}
				break
			}
		}
	}

	resp.Warnings = warnings
	c.JSON(http.StatusOK, resp)
}
