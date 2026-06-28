// Package handlers exposes repost campaign HTTP endpoints.
package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// RepostHandler holds the repost HTTP adapter.
type RepostHandler struct {
	campaignRepo repo.RepostCampaignRepo
	jobRepo      repo.RepostJobRepo
	kit          service.KitLoader
	groupRepo    repo.FBGroupRepo
	crawledRepo  repo.CrawledPostRepo
	svc          *service.RepostCampaignService
	sidecar      *service.SidecarClient
}

// NewRepostHandler wires dependencies.
func NewRepostHandler(
	campaignRepo repo.RepostCampaignRepo,
	jobRepo repo.RepostJobRepo,
	kit service.KitLoader,
	groupRepo repo.FBGroupRepo,
	crawledRepo repo.CrawledPostRepo,
	svc *service.RepostCampaignService,
	sidecar *service.SidecarClient,
) *RepostHandler {
	return &RepostHandler{
		campaignRepo: campaignRepo,
		jobRepo:      jobRepo,
		kit:          kit,
		groupRepo:    groupRepo,
		crawledRepo:  crawledRepo,
		svc:          svc,
		sidecar:      sidecar,
	}
}

// ─── Campaigns ───────────────────────────────────────────────────────

// ListCampaigns godoc
// @Summary List repost campaigns
// @Tags repost
func (h *RepostHandler) ListCampaigns(c *gin.Context) {
	campaigns, err := h.campaignRepo.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, campaigns)
}

// CreateCampaign godoc
// @Summary Create a repost campaign
// @Tags repost
func (h *RepostHandler) CreateCampaign(c *gin.Context) {
	var req struct {
		Name           string   `json:"name" binding:"required"`
		SourcePostURL  string   `json:"sourcePostUrl" binding:"required"`
		SourcePostText string   `json:"sourcePostText" binding:"required"`
		MediaURLs      []string `json:"mediaUrls"`
		CaptionStyle   string   `json:"captionStyle"`
		ScheduledAt    string   `json:"scheduledAt" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scheduledAt, err := time.Parse(time.RFC3339, req.ScheduledAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scheduledAt must be RFC3339"})
		return
	}
	campaign, err := h.svc.CreateCampaign(c.Request.Context(), req.Name, req.SourcePostURL, req.SourcePostText, req.MediaURLs, req.CaptionStyle, scheduledAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, campaign)
}

// RunCampaign godoc
// @Summary Run a repost campaign immediately
// @Tags repost
func (h *RepostHandler) RunCampaign(c *gin.Context) {
	id := c.Param("id")
	if err := h.svc.RunCampaign(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetCampaignJobs godoc
// @Summary List jobs for a campaign
// @Tags repost
func (h *RepostHandler) GetCampaignJobs(c *gin.Context) {
	id := c.Param("id")
	jobs, err := h.jobRepo.ListForCampaign(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, jobs)
}

// DeleteCampaignRequest is the body for POST /delete-repost-campaign.
type DeleteCampaignRequest struct {
	ID string `json:"id" binding:"required"`
}

// DeleteCampaign godoc
// @Summary Delete a repost campaign (and its jobs) by id
// @Tags repost
func (h *RepostHandler) DeleteCampaign(c *gin.Context) {
	var req DeleteCampaignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.campaignRepo.Delete(c.Request.Context(), req.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "id": req.ID})
}

// ─── Crawl ───────────────────────────────────────────────────────────

// CrawlPage godoc
// @Summary Crawl a Facebook page for posts
// @Tags repost
func (h *RepostHandler) CrawlPage(c *gin.Context) {
	var req struct {
		PageURL string `json:"pageUrl" binding:"required"`
		PageID  string `json:"pageId" binding:"required"`
		Limit   int    `json:"limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Limit <= 0 {
		req.Limit = 10
	}
	posts, err := h.svc.CrawlPage(c.Request.Context(), req.PageURL, req.PageID, req.Limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, posts)
}

// ListCrawledPosts godoc
// @Summary List crawled posts for a page
// @Tags repost
func (h *RepostHandler) ListCrawledPosts(c *gin.Context) {
	pageID := c.Query("pageId")
	if pageID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pageId required"})
		return
	}
	posts, err := h.crawledRepo.ListForPage(c.Request.Context(), pageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, posts)
}

// ─── Accounts (Phase 6) ─────────────────────────────────────────────
//
// ListAccounts / CreateAccount / DeleteAccount / LoginAccount /
// AccountLoginStatus used to live here, backed by the SQL fb_accounts
// table. The table is gone (Phase 6) and the on-disk kit-accounts pool
// at ~/mdp-data/accounts/ is now the single source of truth — see
// handlers.NewRepostHandler's `kit` field and the kit-accounts handler
// mounted by router.go at /api/v1/facebook/kit-accounts. Legacy
// /fb-accounts* HTTP routes now return 410 Gone (see router.go).

// ─── Accounts (Phase 6) ─────────────────────────────────────────────
//
// ListAccounts / CreateAccount / DeleteAccount / LoginAccount /
// AccountLoginStatus used to live here, backed by the SQL fb_accounts
// table. The table is gone (Phase 6) and the on-disk kit-accounts pool
// at ~/mdp-data/accounts/ is now the single source of truth — see
// handlers.NewRepostHandler's `kit` field and the kit-accounts handler
// mounted by router.go at /api/v1/facebook/kit-accounts. Legacy
// /fb-accounts* HTTP routes now return 410 Gone (see router.go).

// ─── Groups ──────────────────────────────────────────────────────────

// ListGroups godoc
// @Summary List FB groups
// @Tags repost
func (h *RepostHandler) ListGroups(c *gin.Context) {
	groups, err := h.groupRepo.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, groups)
}

// CreateGroup godoc
// @Summary Create a FB group
// @Tags repost
func (h *RepostHandler) CreateGroup(c *gin.Context) {
	var req models.FBGroup
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	group, err := h.groupRepo.Create(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, group)
}

// CreateGroupFromURLRequest is the body for POST /fb-groups/from-url.
// The user just pastes a Facebook group URL — the server extracts the
// numeric ID and (best-effort) display name via the sidecar, and
// creates the row in one round-trip.
type CreateGroupFromURLRequest struct {
	URL               string  `json:"url" binding:"required"`
	Name              *string `json:"name,omitempty"`
	AssignedAccountID *string `json:"assignedAccountId,omitempty"`
}

// CreateGroupFromURL godoc
// @Summary Resolve a Facebook group URL and create the row in one call
// @Tags repost
func (h *RepostHandler) CreateGroupFromURL(c *gin.Context) {
	var req CreateGroupFromURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if h.sidecar == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "sidecar not configured"})
		return
	}
	resolved, err := h.sidecar.ResolveGroup(c.Request.Context(), req.URL)
	if err != nil {
		// Sidecar returns 400 with a human-readable Vietnamese message
		// when the URL is unparseable. Forward that as 400 to the
		// plugin; any other error is a 502 (sidecar is up but broken).
		msg := err.Error()
		if strings.Contains(msg, "sidecar group-resolve 400") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "URL không đúng định dạng nhóm Facebook (vd: https://www.facebook.com/groups/1234567890)"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	// Caller may have overridden the auto-detected name; prefer the
	// explicit value when supplied.
	name := resolved.Name
	if req.Name != nil && *req.Name != "" {
		name = *req.Name
	}
	group, err := h.groupRepo.Create(c.Request.Context(), models.FBGroup{
		GroupID:           resolved.GroupID,
		Name:              &name,
		AssignedAccountID: req.AssignedAccountID,
		Status:            "active", // CHECK constraint requires one of: active|inactive|removed
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, group)
}

// DeleteGroupRequest is the body for POST /delete-fb-group.
type DeleteGroupRequest struct {
	ID string `json:"id" binding:"required"`
}

// DeleteGroup godoc
// @Summary Delete a FB group row by id
// @Description Note: repost_jobs.group_id is a plain TEXT column with no
// @Description FK, so existing jobs that reference the deleted group will
// @Description keep the group_id text and may fail at runtime. The plugin
// @Description shows a warning in the confirm dialog before calling this.
// @Tags repost
func (h *RepostHandler) DeleteGroup(c *gin.Context) {
	var req DeleteGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.groupRepo.Delete(c.Request.Context(), req.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "id": req.ID})
}

// ─── Repost V2 (SCA port) ───────────────────────────────────────────

// CrawlPageV2 godoc
// @Summary Crawl a Facebook page with optional untilDate and post-filtering
// @Tags repost
// @Description SCA-style "Thu thập bài viết" endpoint. Returns the top
// @Description `limit` newest posts from `pageUrl`, optionally scoped to
// @Description `untilDate` ("lấy N bài mới nhất từ ngày đã chọn trở đi").
func (h *RepostHandler) CrawlPageV2(c *gin.Context) {
	var req struct {
		PageURL   string `json:"pageUrl" binding:"required"`
		PageID    string `json:"pageId"`
		Limit     int    `json:"limit"`
		UntilDate string `json:"untilDate"` // RFC3339, YYYY-MM-DD, or DD/MM/YYYY; empty = no lower bound
		AccountID string `json:"accountId"` // optional: pick this account's profilePath
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Limit <= 0 {
		req.Limit = 10
	}
	var until *time.Time
	if req.UntilDate != "" {
		t, err := parseUntilDate(req.UntilDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "untilDate: " + err.Error()})
			return
		}
		until = &t
	}
	if h.svc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "sidecar not configured"})
		return
	}
	// Resolve which Chrome profile to use. Order of preference:
	//  1. accountId the client picked (UI lets the user choose) — this
	//     is the SHA1-v5 UUID derived from the kit account name; we
	//     reverse-lookup via KitLoader
	//  2. first kit account on disk that is "active"
	//  3. empty string — sidecar falls back to its default profile
	//     (fine for fully public pages, no cookies).
	profilePath := ""
	if h.kit != nil {
		if req.AccountID != "" {
			if accID, perr := uuid.Parse(req.AccountID); perr == nil {
				if acc, err := h.kit.LookupByUUID(c.Request.Context(), accID); err == nil && acc.ProfilePath != "" {
					profilePath = acc.ProfilePath
				}
			}
		} else {
			accts, err := h.kit.LookupAll(c.Request.Context())
			if err == nil {
				for _, a := range accts {
					if a.Status == "active" || a.Status == "hoạt động" || a.Status == "" {
						if a.ProfilePath != "" {
							profilePath = a.ProfilePath
							break
						}
					}
				}
			}
		}
	}
	posts, err := h.svc.CrawlPageV2(c.Request.Context(), req.PageURL, req.PageID, req.Limit, until, profilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, posts)
}

// PlanRepost godoc
// @Summary Create a repost campaign from a source post + multi-slot schedule
// @Tags repost
func (h *RepostHandler) PlanRepost(c *gin.Context) {
	var req struct {
		Name           string            `json:"name" binding:"required"`
		SourcePostURL  string            `json:"sourcePostUrl" binding:"required"`
		SourcePostText string            `json:"sourcePostText" binding:"required"`
		MediaURLs      []string          `json:"mediaUrls"`
		CaptionStyle   string            `json:"captionStyle"`
		Items          []models.PlanItem `json:"items" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if h.svc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service not configured"})
		return
	}
	campaign, err := h.svc.PlanRepost(c.Request.Context(), req.Name, req.SourcePostURL, req.SourcePostText, req.MediaURLs, req.CaptionStyle, req.Items)
	if err != nil {
		if errors.Is(err, service.ErrPastSchedule) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, campaign)
}

// ListQueue godoc
// @Summary List repost jobs across all campaigns (queue view)
// @Tags repost
func (h *RepostHandler) ListQueue(c *gin.Context) {
	f := models.QueueFilter{
		Status:    c.Query("status"),
		AccountID: c.Query("accountId"),
		GroupID:   c.Query("groupId"),
	}
	if lim, err := strconv.Atoi(c.Query("limit")); err == nil {
		f.Limit = lim
	}
	if h.svc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service not configured"})
		return
	}
	jobs, err := h.svc.ListQueue(c.Request.Context(), f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, jobs)
}

// RescheduleJob godoc
// @Summary Reschedule a single repost job to a new time
// @Tags repost
func (h *RepostHandler) RescheduleJob(c *gin.Context) {
	jobID := c.Param("id")
	var req struct {
		ScheduledAt string `json:"scheduledAt" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	when, err := time.Parse(time.RFC3339, req.ScheduledAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scheduledAt must be RFC3339"})
		return
	}
	if h.svc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service not configured"})
		return
	}
	if err := h.svc.RescheduleJob(c.Request.Context(), jobID, when); err != nil {
		if errors.Is(err, service.ErrPastSchedule) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// SetJobFlags godoc
// @Summary Update a job's auto_enabled + anonymous_posting flags
// @Tags repost
func (h *RepostHandler) SetJobFlags(c *gin.Context) {
	jobID := c.Param("id")
	var req struct {
		AutoEnabled      bool   `json:"autoEnabled"`
		AnonymousPosting bool   `json:"anonymousPosting"`
		ScheduledAt      string `json:"scheduledAt"` // preserved from plugin's last-known state
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if h.svc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service not configured"})
		return
	}
	// The plugin got the schedule from the previous ListQueue response
	// and sends it back so the server can keep it intact. Accept both
	// RFC3339 and the empty string (= unknown, skip update).
	var schedulePtr *time.Time
	if req.ScheduledAt != "" {
		if t, perr := time.Parse(time.RFC3339, req.ScheduledAt); perr == nil {
			schedulePtr = &t
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "scheduledAt must be RFC3339"})
			return
		}
	}
	if err := h.svc.SetJobFlagsForJob(c.Request.Context(), jobID, schedulePtr, req.AutoEnabled, req.AnonymousPosting); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// parseUntilDate accepts RFC3339, YYYY-MM-DD, or DD/MM/YYYY (date-only).
//
// Date-only ("2026-06-12" or "12/06/2026") is interpreted as the chosen calendar day
// in the *server's local timezone* (time.Local — usually Asia/Ho_Chi_Minh
// in deployment). The function returns the **exclusive end of that
// day** (next-day local midnight), so callers can use the standard
// `t.After(*until)` / `t > *until` test to drop posts strictly newer
// than the chosen day in the user's local timezone. Posts anywhere
// on the chosen day (00:00:00.000 – 23:59:59.999 local) are kept.
//
// Why +1 day: parseUntilDate is the single source of truth for the
// "Từ ngày" cutoff. Returning an inclusive end-of-day sentinel keeps
// the filter functions (Go and JS) trivially simple — they only need
// one comparison operator and never have to think about the 23:59:59
// edge case.
//
// Caveat for tests: tests that pin untilDate to UTC will see a
// different result than tests that let the package run in the host's
// local TZ. The exported tests below force time.Local via t.Setenv so
// they are reproducible across machines.
func parseUntilDate(s string) (time.Time, error) {
	loc := time.Local
	if t, err := time.ParseInLocation(time.RFC3339, s, loc); err == nil {
		return t, nil
	}
	for _, layout := range []string{"2006-01-02", "02/01/2006"} {
		if t, err := time.ParseInLocation(layout, s, loc); err == nil {
			// Exclusive end-of-day: includes every post on the chosen day
			// in the local timezone.
			return t.AddDate(0, 0, 1), nil
		}
	}
	return time.Time{}, fmt.Errorf("expected RFC3339, YYYY-MM-DD, or DD/MM/YYYY")
}
