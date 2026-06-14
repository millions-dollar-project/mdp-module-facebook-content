package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Queue is the business-logic surface for the content-queue resource.
type Queue struct {
	repo  repo.QueueRepo
	pages repo.PagesRepo
	pub   *Publisher
	log   *slog.Logger
}

// NewQueue builds a Queue service.
func NewQueue(r repo.QueueRepo, p repo.PagesRepo, pub *Publisher, log *slog.Logger) *Queue {
	return &Queue{repo: r, pages: p, pub: pub, log: log}
}

// List returns all queue items.
func (s *Queue) List(ctx context.Context) ([]models.QueueItem, error) {
	return s.repo.List(ctx)
}

// Approve moves an item to READY so the worker / publish-now can pick
// it up. Returns the updated row.
func (s *Queue) Approve(ctx context.Context, id string) (models.QueueItem, error) {
	return s.repo.UpdateStatus(ctx, id, models.QueueStatusReady)
}

// Reject moves an item to REJECTED. No further actions.
func (s *Queue) Reject(ctx context.Context, id string) (models.QueueItem, error) {
	return s.repo.UpdateStatus(ctx, id, models.QueueStatusRejected)
}

// PublishNow publishes the queue item immediately. We re-fetch first
// because the row may have been picked up by the scheduler worker in
// the gap between click and request.
func (s *Queue) PublishNow(ctx context.Context, id string) (models.PublishResult, error) {
	item, err := s.repo.Get(ctx, id)
	if err != nil {
		return models.PublishResult{}, err
	}
	if item.PageID == nil {
		return models.PublishResult{}, errors.New("queue item has no pageId — cannot publish")
	}
	page, err := s.pages.Get(ctx, *item.PageID)
	if err != nil {
		return models.PublishResult{}, fmt.Errorf("lookup page: %w", err)
	}
	if _, err := s.pub.PublishContent(ctx, page, item.Content); err != nil {
		return models.PublishResult{}, err
	}
	if _, err := s.repo.UpdateStatus(ctx, id, models.QueueStatusPublished); err != nil {
		return models.PublishResult{}, err
	}
	return models.PublishResult{ID: id, Status: string(models.QueueStatusPublished)}, nil
}

// RegenerateContent is the AI echo stub. The real OpenAI call lands in
// Phase 3. We prepend "[AI-STUB] " so the UI visibly distinguishes
// generated drafts from manually typed ones.
func (s *Queue) RegenerateContent(ctx context.Context, id string) (models.QueueItem, error) {
	item, err := s.repo.Get(ctx, id)
	if err != nil {
		return models.QueueItem{}, err
	}
	rewritten := "[AI-STUB] " + item.Content
	return s.repo.UpdateContent(ctx, id, rewritten)
}

// Delete removes an item. Used for the "Xoá" button.
func (s *Queue) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
