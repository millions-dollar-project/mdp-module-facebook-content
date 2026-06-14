package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// CommentWorker polls active pages and runs comment monitoring on each
// page at a fixed interval. It is started by cmd/server/main.go as a
// background goroutine.
type CommentWorker struct {
	monitor   *CommentMonitor
	pages     repo.PagesRepo
	interval  time.Duration
	log       *slog.Logger
}

// NewCommentWorker builds a CommentWorker. interval should be in the
// 30–120 s range depending on page volume and Graph API rate limits.
func NewCommentWorker(m *CommentMonitor, p repo.PagesRepo, interval time.Duration, log *slog.Logger) *CommentWorker {
	return &CommentWorker{
		monitor:  m,
		pages:    p,
		interval: interval,
		log:      log,
	}
}

// Run blocks until ctx is cancelled. It runs an immediate tick then
// waits on the ticker.
func (w *CommentWorker) Run(ctx context.Context) {
	w.log.Info("comment worker started", "interval", w.interval.String())
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	w.processOnce(ctx)
	for {
		select {
		case <-ctx.Done():
			w.log.Info("comment worker stopped")
			return
		case <-ticker.C:
			w.processOnce(ctx)
		}
	}
}

func (w *CommentWorker) processOnce(ctx context.Context) {
	pages, err := w.pages.List(ctx)
	if err != nil {
		w.log.Error("comment worker list pages failed", "err", err)
		return
	}
	for _, page := range pages {
		if !page.IsActive || page.PageAccessToken == "" {
			continue
		}
		if err := w.monitor.ProcessPageComments(ctx, page.PageID); err != nil {
			w.log.Warn("comment monitor failed", "pageID", page.PageID, "err", err)
		}
	}
}
