package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Scheduler is the business-logic surface for the scheduled-posts
// resource. It writes to the queue (via the SchedulerRepo) and lets
// the Worker goroutine (service/worker.go) flip rows to PUBLISHING.
type Scheduler struct {
	repo  repo.SchedulerRepo
	pages repo.PagesRepo
	pub   *Publisher
	log   *slog.Logger
}

// NewScheduler builds a Scheduler service.
func NewScheduler(r repo.SchedulerRepo, p repo.PagesRepo, pub *Publisher, log *slog.Logger) *Scheduler {
	return &Scheduler{repo: r, pages: p, pub: pub, log: log}
}

// List returns all scheduled posts.
func (s *Scheduler) List(ctx context.Context) ([]models.ScheduledPost, error) {
	return s.repo.List(ctx)
}

// Schedule creates a new SCHEDULED row. pageId here is the *Facebook*
// page id (not our internal uuid) — the plugin sends what the user
// sees in the UI, not the database row id. We resolve it here.
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

// PublishNow is the "Đăng ngay" button on a scheduled row.
func (s *Scheduler) PublishNow(ctx context.Context, id string) (models.ScheduledPost, error) {
	row, err := s.repo.Get(ctx, id)
	if err != nil {
		return models.ScheduledPost{}, err
	}
	if row.Status != models.ScheduleStatusScheduled {
		return models.ScheduledPost{}, fmt.Errorf("cannot publish: status is %s", row.Status)
	}
	page, err := s.pages.Get(ctx, row.PageID)
	if err != nil {
		return models.ScheduledPost{}, fmt.Errorf("lookup page: %w", err)
	}
	fbPostID, err := s.pub.PublishContent(ctx, page, row.Content)
	if err != nil {
		return models.ScheduledPost{}, err
	}
	return s.repo.MarkPublished(ctx, id, fbPostID)
}

// Cancel is the "Hủy" button.
func (s *Scheduler) Cancel(ctx context.Context, id string) (models.ScheduledPost, error) {
	return s.repo.Cancel(ctx, id)
}
