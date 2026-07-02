package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Scheduler is the business-logic surface for the scheduled-posts
// resource. It writes to the queue (via the SchedulerRepo) and lets
// the Worker goroutine (service/worker.go) flip rows to PUBLISHING.
//
// Since migration 028 the table can carry personal-profile posts
// (post_type='personal'). Those have a kit_account_id instead of a
// page_id, and they publish through the sidecar's /profile-post
// Playwright route instead of the Graph API. The Scheduler routes
// the two cases on row.PostType.
type Scheduler struct {
	repo    repo.SchedulerRepo
	pages   repo.PagesRepo
	pub     *Publisher
	sidecar *SidecarClient
	kit     KitLoader
	log     *slog.Logger
}

// NewScheduler builds a Scheduler service. kit and sidecar are only
// required for post_type='personal' rows; if a caller only schedules
// fanpage posts they may pass nil for both (the personal code path
// returns a clear error when invoked).
func NewScheduler(r repo.SchedulerRepo, p repo.PagesRepo, pub *Publisher, sidecar *SidecarClient, kit KitLoader, log *slog.Logger) *Scheduler {
	return &Scheduler{repo: r, pages: p, pub: pub, sidecar: sidecar, kit: kit, log: log}
}

// List returns all scheduled posts.
func (s *Scheduler) List(ctx context.Context) ([]models.ScheduledPost, error) {
	return s.repo.List(ctx)
}

// Schedule creates a new SCHEDULED fanpage row. pageId here is the
// *Facebook* page id (not our internal uuid) — the plugin sends what
// the user sees in the UI, not the database row id. We resolve it
// here.
//
// For personal-profile posts (the FB-content crawl → brain → schedule
// flow) use SchedulePersonal instead — it takes a kit account UUID
// and produces a post_type='personal' row with no page_id.
func (s *Scheduler) Schedule(ctx context.Context, fbPageID, content string, scheduledAt time.Time) (models.ScheduledPost, error) {
	if content == "" {
		return models.ScheduledPost{}, errors.New("content is required")
	}
	if scheduledAt.Before(time.Now().Add(-1 * time.Minute)) {
		return models.ScheduledPost{}, errors.New("scheduledAt must be in the future")
	}
	page, err := s.pages.GetByFBID(ctx, fbPageID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return models.ScheduledPost{}, fmt.Errorf("page %q not registered", fbPageID)
		}
		return models.ScheduledPost{}, err
	}
	return s.repo.Schedule(ctx, models.ScheduledPost{
		PageID:      page.ID,
		Content:     content,
		ScheduledAt: scheduledAt,
		PostType:    models.PostTypeText,
	})
}

// SchedulePersonal inserts a SCHEDULED row targeting the kit-account's
// own personal timeline. The sidecar will use the kit account's
// Chromium profile (resolved via KitLoader.LookupByUUID) to drive
// /me. accountID is the SHA-1 v5 UUID; the loader maps it to a
// KitAccountSnapshot whose ProfilePath is the persistent-context dir.
func (s *Scheduler) SchedulePersonal(ctx context.Context, accountID string, content string, scheduledAt time.Time, mediaURLs []string) (models.ScheduledPost, error) {
	if s.kit == nil {
		return models.ScheduledPost{}, errors.New("kit loader not configured")
	}
	if accountID == "" {
		return models.ScheduledPost{}, errors.New("accountId is required")
	}
	if content == "" {
		return models.ScheduledPost{}, errors.New("content is required")
	}
	if scheduledAt.Before(time.Now().Add(-1 * time.Minute)) {
		return models.ScheduledPost{}, errors.New("scheduledAt must be in the future")
	}
	uid, err := uuid.Parse(accountID)
	if err != nil {
		return models.ScheduledPost{}, fmt.Errorf("invalid kit account uuid: %w", err)
	}
	if _, err := s.kit.LookupByUUID(ctx, uid); err != nil {
		return models.ScheduledPost{}, fmt.Errorf("kit account not found: %w", err)
	}
	media := json.RawMessage("[]")
	if len(mediaURLs) > 0 {
		b, mErr := json.Marshal(mediaURLs)
		if mErr != nil {
			return models.ScheduledPost{}, mErr
		}
		media = b
	}
	kitID := accountID
	return s.repo.Schedule(ctx, models.ScheduledPost{
		Content:      content,
		MediaURLs:    media,
		ScheduledAt:  scheduledAt,
		PostType:     models.PostTypePersonal,
		AIGenerated:  true,
		KitAccountID: &kitID,
	})
}

// Reschedule moves a SCHEDULED row to a new time. The postType guard
// is enforced by the SQL UPDATE (see repo.UpdateScheduledAt) so a
// caller that asserts the wrong post type gets ErrNotFound back
// instead of silently mutating the other table flavor's row.
func (s *Scheduler) Reschedule(ctx context.Context, id string, postType models.PostType, scheduledAt time.Time) (models.ScheduledPost, error) {
	if scheduledAt.Before(time.Now().Add(-1 * time.Minute)) {
		return models.ScheduledPost{}, errors.New("scheduledAt must be in the future")
	}
	return s.repo.UpdateScheduledAt(ctx, id, scheduledAt, postType)
}

// PublishNow is the "Đăng ngay" button on a scheduled row. Branches on
// post_type:
//   - "personal" → sidecar.PostToProfile (Playwright /me composer)
//   - anything else → Publisher.PublishContent (Graph API to a Page)
//
// Atomic claim: transitions SCHEDULED → PUBLISHING first so the Kanban
// "Đang đăng" column pops immediately while the (potentially slow)
// Playwright / Graph call runs. On any failure we roll back to FAILED
// with the underlying error message.
func (s *Scheduler) PublishNow(ctx context.Context, id string) (models.ScheduledPost, error) {
	row, err := s.repo.Get(ctx, id)
	if err != nil {
		return models.ScheduledPost{}, err
	}
	if row.Status != models.ScheduleStatusScheduled {
		return models.ScheduledPost{}, fmt.Errorf("cannot publish: status is %s", row.Status)
	}
	if _, err := s.repo.MarkPublishing(ctx, id); err != nil {
		return models.ScheduledPost{}, fmt.Errorf("claim publishing: %w", err)
	}
	if row.PostType == models.PostTypePersonal {
		return s.publishPersonal(ctx, row)
	}
	page, err := s.pages.Get(ctx, row.PageID)
	if err != nil {
		failed, mErr := s.repo.MarkFailed(ctx, id, "lookup page: "+err.Error())
		if mErr != nil {
			return models.ScheduledPost{}, mErr
		}
		return failed, err
	}
	fbPostID, err := s.pub.PublishContent(ctx, page, row.Content)
	if err != nil {
		failed, mErr := s.repo.MarkFailed(ctx, id, err.Error())
		if mErr != nil {
			return models.ScheduledPost{}, mErr
		}
		return failed, err
	}
	return s.repo.MarkPublished(ctx, id, fbPostID)
}

// publishPersonal is the Playwright /me path. Resolves the row's
// kit_account_id → KitAccountSnapshot → ProfilePath, then calls
// sidecar.PostToProfile. The post URL is stored in
// scheduled_posts.facebook_post_id (the column is reused: it
// represents "external post id" for fanpage rows and "external post
// URL" for personal rows).
//
// Pre-condition: caller has already flipped status to PUBLISHING. On
// any error here we MarkFailed so the Kanban's "Hoàn tất / Lỗi"
// column picks it up and the user sees the underlying sidecar reason
// instead of a permanently-stuck PUBLISHING card.
func (s *Scheduler) publishPersonal(ctx context.Context, row models.ScheduledPost) (models.ScheduledPost, error) {
	if s.kit == nil || s.sidecar == nil {
		return s.failPersonal(ctx, row, "kit loader + sidecar required for personal posts")
	}
	if row.KitAccountID == nil || *row.KitAccountID == "" {
		return s.failPersonal(ctx, row, "personal row missing kit_account_id")
	}
	uid, err := uuid.Parse(*row.KitAccountID)
	if err != nil {
		return s.failPersonal(ctx, row, "invalid kit account uuid: "+err.Error())
	}
	snap, err := s.kit.LookupByUUID(ctx, uid)
	if err != nil {
		return s.failPersonal(ctx, row, "kit account lookup: "+err.Error())
	}
	if snap.ProfilePath == "" {
		return s.failPersonal(ctx, row, "kit account has no ProfilePath; re-login required")
	}
	var media []string
	if len(row.MediaURLs) > 0 {
		_ = json.Unmarshal(row.MediaURLs, &media)
	}
	res, err := s.sidecar.PostToProfile(ctx, snap.ProfilePath, row.Content, media)
	if err != nil {
		return s.failPersonal(ctx, row, err.Error())
	}
	if !res.Success {
		return s.failPersonal(ctx, row, res.Error)
	}
	return s.repo.MarkPublished(ctx, row.ID, res.PostURL)
}

// Cancel is the "Hủy" button.
func (s *Scheduler) Cancel(ctx context.Context, id string) (models.ScheduledPost, error) {
	return s.repo.Cancel(ctx, id)
}

// failPersonal rolls a PUBLISHING personal row back to FAILED and
// returns the row plus the original error. If the rollback itself
// fails (e.g. row vanished mid-call) we still surface the original
// error so the caller can show it to the user.
func (s *Scheduler) failPersonal(ctx context.Context, row models.ScheduledPost, msg string) (models.ScheduledPost, error) {
	failed, mErr := s.repo.MarkFailed(ctx, row.ID, msg)
	if mErr != nil {
		s.log.Warn("mark failed after personal publish error failed", "id", row.ID, "err", mErr)
		return row, errors.New(msg)
	}
	return failed, errors.New(msg)
}
