package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// scheduledForWorker is a tiny alias so the loop body in processRow is
// readable. It matches the slice element type of repo.SchedulerRepo.ListDue.
type scheduledForWorker = models.ScheduledPost

// Worker is the in-process goroutine that polls scheduled_posts for
// rows that are due and publishes them. It is intentionally simple:
// one ticker, no leader election, no retry queue. Phase 4 will harden.
type Worker struct {
	scheduler repo.SchedulerRepo
	pages     repo.PagesRepo
	pub       *Publisher
	interval  time.Duration
	batchSize int32
	log       *slog.Logger
}

// NewWorker builds a Worker. The caller (cmd/server/main.go) decides
// the interval from config; default is 60s.
func NewWorker(s repo.SchedulerRepo, p repo.PagesRepo, pub *Publisher, interval time.Duration, log *slog.Logger) *Worker {
	return &Worker{
		scheduler: s,
		pages:     p,
		pub:       pub,
		interval:  interval,
		batchSize: 50,
		log:       log,
	}
}

// Run blocks until ctx is cancelled, calling processOnce on each tick.
// Errors are logged but do not stop the loop — transient DB or API
// hiccups should not crash the server.
func (w *Worker) Run(ctx context.Context) {
	w.log.Info("worker started", "interval", w.interval.String(), "batch_size", w.batchSize)
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	// Fire one tick immediately so a service started with already-due
	// rows publishes them without waiting a full interval.
	w.processOnce(ctx)
	for {
		select {
		case <-ctx.Done():
			w.log.Info("worker stopped")
			return
		case <-ticker.C:
			w.processOnce(ctx)
		}
	}
}

// processOnce fetches up to batchSize due rows, tries to claim each
// (atomic UPDATE…SET status='PUBLISHING' WHERE status='SCHEDULED'), then
// publishes. Failures mark the row FAILED with the error message.
func (w *Worker) processOnce(ctx context.Context) {
	due, err := w.scheduler.ListDue(ctx, w.batchSize)
	if err != nil {
		w.log.Error("worker list due failed", "err", err)
		return
	}
	if len(due) == 0 {
		return
	}
	w.log.Info("worker processing due posts", "count", len(due))
	for _, row := range due {
		w.processRow(ctx, row)
	}
}

func (w *Worker) processRow(ctx context.Context, row scheduledForWorker) {
	// We don't need the claim-by-update dance for the simple in-process
	// worker (only one instance), but keeping it makes the worker safe
	// to scale to N instances later without code change.
	if _, err := w.scheduler.MarkPublishing(ctx, row.ID); err != nil {
		w.log.Warn("worker mark publishing failed (likely already claimed)", "id", row.ID, "err", err)
		return
	}
	page, err := w.pages.Get(ctx, row.PageID)
	if err != nil {
		w.log.Error("worker lookup page failed", "id", row.ID, "err", err)
		_, _ = w.scheduler.MarkFailed(ctx, row.ID, "page lookup: "+err.Error())
		return
	}
	if !page.IsActive || !page.PostingEnabled {
		_, _ = w.scheduler.MarkFailed(ctx, row.ID, "page inactive or posting disabled")
		return
	}
	fbPostID, err := w.pub.PublishContent(ctx, page, row.Content)
	if err != nil {
		w.log.Error("worker publish failed", "id", row.ID, "err", err)
		_, _ = w.scheduler.MarkFailed(ctx, row.ID, err.Error())
		return
	}
	if _, err := w.scheduler.MarkPublished(ctx, row.ID, fbPostID); err != nil {
		w.log.Error("worker mark published failed", "id", row.ID, "err", err)
	}
}
