// Package handlers exposes brain feed HTTP endpoints (/brain/feed,
// /brain/ingest, /brain/generate). The handlers depend on three small
// interfaces so tests can inject fakes without spinning up the
// mdp-brain MCP subprocess.
package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// BrainFeedLister covers List + Delete. In production the
// *service.BrainFeedService satisfies this interface; tests use a
// stub.
type BrainFeedLister interface {
	List(ctx context.Context, f repo.BrainFeedFilter, page, pageSize int) ([]models.BrainFeedRow, int64, error)
	Delete(ctx context.Context, id string) error
}

// BrainFeedIngestCaller covers Ingest.
type BrainFeedIngestCaller interface {
	Ingest(ctx context.Context, posts []models.CrawledPostInput) (models.IngestResult, error)
}

// BrainFeedGenerateCaller covers Generate.
type BrainFeedGenerateCaller interface {
	Generate(ctx context.Context, feedIDs []string, personaID string) ([]models.BrainDraftRow, []models.GenerateFailure, error)
}

// BrainFeedHandler adapts the three interfaces above to the HTTP layer.
type BrainFeedHandler struct {
	svc      BrainFeedLister
	ingest   BrainFeedIngestCaller
	generate BrainFeedGenerateCaller
}

// NewBrainFeedHandler wires the three dependencies. ingest and
// generate may be nil — the handler returns 503 Service Unavailable
// when called on a nil service, mirroring the SidecarClient pattern
// in repost.go.
func NewBrainFeedHandler(svc BrainFeedLister, ingest BrainFeedIngestCaller, generate BrainFeedGenerateCaller) *BrainFeedHandler {
	return &BrainFeedHandler{svc: svc, ingest: ingest, generate: generate}
}

// List godoc
// @Summary List brain feed rows with filters and pagination
// @Tags brain
func (h *BrainFeedHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	var f repo.BrainFeedFilter
	if v := c.Query("source_page"); v != "" {
		f.SourcePage = &v
	}
	if v := c.Query("status"); v != "" {
		f.Status = &v
	}
	if v := c.Query("search"); v != "" {
		f.Search = &v
	}
	if v := c.Query("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			f.From = &t
		}
	}
	if v := c.Query("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			f.To = &t
		}
	}
	if h.svc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": "brain_not_configured", "message": "brain service not configured"})
		return
	}
	items, total, err := h.svc.List(c.Request.Context(), f, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "list_failed", "message": err.Error()})
		return
	}
	if items == nil {
		items = []models.BrainFeedRow{}
	}
	c.JSON(http.StatusOK, gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// Delete godoc
// @Summary Delete a single brain feed row by id
// @Tags brain
func (h *BrainFeedHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": "id_required", "message": "id is required"})
		return
	}
	if h.svc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": "brain_not_configured", "message": "brain service not configured"})
		return
	}
	if err := h.svc.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "delete_failed", "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

type ingestReq struct {
	Posts []models.CrawledPostInput `json:"posts" binding:"required"`
}

// Ingest godoc
// @Summary Ingest crawled Facebook posts into the brain feed
// @Tags brain
// @Param account_id query string false "Per-account scope override (SHA-1 v5 UUID of kit-account name). Empty = default BrainScope."
func (h *BrainFeedHandler) Ingest(c *gin.Context) {
	if h.ingest == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": "ingest_unavailable", "message": "ingest not configured"})
		return
	}
	var req ingestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "bad_request", "message": err.Error()})
		return
	}
	// Stamp per-account scope onto each post so the downstream Brain
	// MCP ingest (and any future brain_feed row key) carries the kit
	// account identifier. Body-level `account_uuid` still wins (a
	// plugin can override per-call), otherwise we fall back to the
	// query parameter so curl callers can pin scope too.
	queryAccountID := c.Query("account_id")
	for i := range req.Posts {
		if req.Posts[i].AccountUUID == "" {
			req.Posts[i].AccountUUID = queryAccountID
		}
	}
	res, err := h.ingest.Ingest(c.Request.Context(), req.Posts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "ingest_failed", "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ingested": res.Ingested,
		"skipped":  res.Skipped,
		"failed":   res.Failed,
	})
}

type generateReq struct {
	FeedIDs   []string `json:"feedIds" binding:"required"`
	PersonaID string   `json:"personaId"`
}

// Generate godoc
// @Summary Run the mdp-brain generate step for a list of feed ids
// @Tags brain
func (h *BrainFeedHandler) Generate(c *gin.Context) {
	if h.generate == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": "generate_unavailable", "message": "generate not configured"})
		return
	}
	var req generateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "bad_request", "message": err.Error()})
		return
	}
	if len(req.FeedIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": "feed_ids_required", "message": "feedIds is required"})
		return
	}
	drafts, failures, err := h.generate.Generate(c.Request.Context(), req.FeedIDs, req.PersonaID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "generate_failed", "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"drafts":   drafts,
		"failures": failures,
	})
}
