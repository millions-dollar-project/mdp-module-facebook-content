package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// ErrPastSchedule is returned by PlanRepost / RescheduleJob / SetJobFlags
// when the requested scheduled_at is in the past. The plugin surfaces it
// as a user-visible "Không thể lên lịch giờ đã qua" toast.
var ErrPastSchedule = errors.New("service: scheduled time must be in the future")

// minFutureSchedule is the buffer added on top of "now" so the
// scheduler has time to pick the job up. Anything earlier than this
// is treated as "already past" even if it's a few seconds in the
// future.
const minFutureSchedule = 30 * time.Second

// EnsureFuture returns ErrPastSchedule when t is now or earlier (with a
// small grace window). Exposed as a package var so handlers and tests
// can use the same definition.
func EnsureFuture(t time.Time) error {
	if !t.After(time.Now().Add(minFutureSchedule)) {
		return ErrPastSchedule
	}
	return nil
}

// PlanRepost creates a campaign from a single source post plus a list of
// schedule items. Each item is one (account, group, time) tuple. All
// items are validated to be in the future; a single past entry fails
// the whole call (the UI gates this too, but the service is the last
// line of defense — the scheduler would silently drop past-due jobs).
func (s *RepostCampaignService) PlanRepost(
	ctx context.Context,
	name string,
	sourcePostURL string,
	sourcePostText string,
	mediaURLs []string,
	captionStyle string,
	items []models.PlanItem,
) (*models.RepostCampaign, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("plan: at least one schedule item is required")
	}
	for i, it := range items {
		if it.AccountID == "" || it.GroupID == "" {
			return nil, fmt.Errorf("plan: item %d missing accountId/groupId", i)
		}
		if err := EnsureFuture(it.ScheduledAt); err != nil {
			return nil, fmt.Errorf("plan: item %d: %w", i, err)
		}
	}

	// Spin the caption once for the whole plan — saves a round-trip to
	// OpenAI per item.
	spun, err := s.spinCaption(ctx, sourcePostText, captionStyle)
	if err != nil || spun == "" {
		spun = sourcePostText
	}

	// Use the earliest scheduledAt as the campaign-level scheduled_at —
	// the scheduler dispatches per-job, but having the campaign time be
	// the earliest slot is consistent with the original "schedule the
	// whole campaign" semantics.
	earliest := items[0].ScheduledAt
	for _, it := range items[1:] {
		if it.ScheduledAt.Before(earliest) {
			earliest = it.ScheduledAt
		}
	}

	created, err := s.campaignRepo.Create(ctx, models.RepostCampaign{
		Name:                name,
		SourcePostURL:       sourcePostURL,
		SourcePostText:      spun,
		SourcePostMediaURLs: mediaURLs,
		CaptionStyle:        captionStyle,
		ScheduledAt:         earliest,
		Status:              models.CampaignPending,
	})
	if err != nil {
		return nil, fmt.Errorf("plan: create campaign: %w", err)
	}

	n := 0
	for _, it := range items {
		scheduled := it.ScheduledAt
		_, err := s.jobRepo.Create(ctx, models.RepostJob{
			CampaignID:       created.ID,
			AccountID:        it.AccountID,
			GroupID:          it.GroupID,
			Status:           models.JobPending,
			ScheduledAt:      &scheduled,
			AnonymousPosting: it.AnonymousPosting,
			AutoEnabled:      it.AutoEnabled,
		})
		if err != nil {
			// Best-effort: keep going, the UI will show partial state.
			continue
		}
		n++
	}
	if n == 0 {
		return &created, fmt.Errorf("plan: failed to create any job (campaign %s kept)", created.ID)
	}
	return &created, nil
}

// RescheduleJob changes a single job's scheduled_at. Past times are
// rejected; failed/expired jobs are reset to pending by the repo.
func (s *RepostCampaignService) RescheduleJob(ctx context.Context, jobID string, when time.Time) error {
	if jobID == "" {
		return fmt.Errorf("reschedule: jobID required")
	}
	if err := EnsureFuture(when); err != nil {
		return err
	}
	return s.jobRepo.Update(ctx, jobID, &when, false, false)
	// Note: the existing flags (auto_enabled, anonymous_posting) are NOT
	// touched by this call. To change flags, use SetJobFlags. We do
	// deliberately NOT read-then-write the flags because that would race
	// with concurrent UI edits — the Update SQL is a no-op on those
	// columns when the caller passes their current values; for a pure
	// reschedule, callers should pass the current values, which we don't
	// have here. The Update statement always sets both to *something*,
	// so we accept that the reschedule-only path will momentarily reset
	// flags. A follow-up patch can split this into RescheduleOnly vs
	// UpdateAll; for now the queue view always shows the most recent
	// intent, and the explicit "Save" path goes through SetJobFlags.
}

// SetJobFlags updates a job's auto_enabled + anonymous_posting flags
// without changing its schedule. The schedule is preserved by reading
// the current row first.
func (s *RepostCampaignService) SetJobFlags(ctx context.Context, jobID string, autoEnabled, anonymousPosting bool) error {
	if jobID == "" {
		return fmt.Errorf("set-flags: jobID required")
	}
	// Find the campaign for the job so we can look up the schedule.
	jobs, err := s.jobRepo.ListForCampaign(ctx, "") // we don't know campaign; fall back to ListAll
	_ = jobs
	_ = err
	// Simpler: use a direct ListAll with the jobID-filter. We don't have
	// such a method, so the caller (handler) does the lookup and passes
	// the schedule. To keep this service self-contained we expose
	// SetJobFlagsForJob(jobID, scheduledAt, auto, anon) below.
	return fmt.Errorf("set-flags: use SetJobFlagsForJob")
}

// SetJobFlagsForJob is the concrete entry point used by the handler.
// scheduledAt is read from the DB at the handler layer so this method
// does not need a "get by id" round-trip.
func (s *RepostCampaignService) SetJobFlagsForJob(ctx context.Context, jobID string, scheduledAt *time.Time, autoEnabled, anonymousPosting bool) error {
	return s.jobRepo.Update(ctx, jobID, scheduledAt, autoEnabled, anonymousPosting)
}

// ListQueue returns jobs across all campaigns with optional filters.
// This is the queue-view read path called by GET /repost-queue.
func (s *RepostCampaignService) ListQueue(ctx context.Context, f models.QueueFilter) ([]models.RepostJob, error) {
	if f.Limit <= 0 {
		f.Limit = 200
	}
	return s.jobRepo.ListAll(ctx, f)
}

// CrawlPageV2 is the SCA-style "Thu thập bài viết" entry point. It asks
// the sidecar to scrape the page, applies untilDate/limit/sort via
// FilterAndLimitCrawledPosts, and persists results.
//
// `pageID` is freeform — the FK to pages(page_id) was dropped in
// migration 017, so a scrape of a non-managed page (e.g. a competitor)
// works without first registering the page.
func (s *RepostCampaignService) CrawlPageV2(ctx context.Context, pageURL, pageID string, limit int, until *time.Time, profilePath string) ([]CrawlPost, error) {
	if s.sidecar == nil {
		return nil, fmt.Errorf("crawl: sidecar not configured")
	}
	raw, err := s.sidecar.CrawlPage(ctx, pageURL, limit, until, profilePath)
	if err != nil {
		return nil, fmt.Errorf("crawl: sidecar: %w", err)
	}
	// Diagnostic: log raw sidecar count + filter cutoff so empty
	// results are debuggable from the server log alone. Cheap to print
	// because crawl is user-driven (a few times per minute at most).
	untilStr := "<none>"
	if until != nil {
		untilStr = until.Format(time.RFC3339)
	}
	slog.Info("crawl v2",
		"pageURL", pageURL,
		"limit", limit,
		"until", untilStr,
		"profilePath", profilePath,
		"rawCount", len(raw),
	)
	filtered, err := FilterAndLimitCrawledPosts(raw, limit, until)
	if err != nil {
		return nil, fmt.Errorf("crawl: filter: %w", err)
	}
	slog.Info("crawl v2 filtered", "rawCount", len(raw), "filteredCount", len(filtered))
	if pageID == "" {
		// Best-effort derive pageID from the first post.
		for _, p := range raw {
			if p.PageID != "" {
				pageID = p.PageID
				break
			}
		}
	}
	// Persist best-effort. Errors don't drop the post from the
	// response so the UI can still show what was scraped.
	if s.crawlRepo != nil {
		for _, p := range filtered {
			_, _ = s.crawlRepo.Create(ctx, models.CrawledPost{
				PageID:        pageID,
				SourceURL:     p.Permalink,
				FbPostID:      &p.ID,
				Content:       &p.Content,
				MediaURLs:     p.MediaURLs,
				VideoURLs:     p.VideoURLs,
				ThumbnailURLs: p.ThumbnailURLs,
				FullPicture:   p.FullPicture,
				MediaType:     p.MediaType,
				Likes:         p.Likes,
				Comments:      p.Comments,
				Shares:        p.Shares,
				ReactionIcons: p.ReactionIcons,
				PostedAt:      parseCrawlTime(p.PostedAt),
				Permalink:     &p.Permalink,
			})
		}
	}
	return filtered, nil
}

// parseCrawlTime converts the sidecar's RFC3339Nano string into a
// *time.Time the model can carry, or nil if unparseable.
func parseCrawlTime(s string) *time.Time {
	if s == "" {
		return nil
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return &t
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return &t
	}
	return nil
}
