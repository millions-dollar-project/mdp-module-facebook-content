package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
)

// BrainFeedRepo wraps sqlc-generated queries for the facebook.brain_feeds
// table. The BrainFeedService layer talks to this repo, never to the raw
// db.Queries; this keeps pgtype.* leakage inside the repo package.
type BrainFeedRepo struct {
	q *db.Queries
}

// NewBrainFeedRepo wires a BrainFeedRepo backed by sqlc.
func NewBrainFeedRepo(q *db.Queries) *BrainFeedRepo {
	return &BrainFeedRepo{q: q}
}

// BrainFeedFilter holds optional filter values for List/Count.
// Nil pointers are translated to "no filter" by the sqlc query
// (empty string for text, NULL for timestamptz).
type BrainFeedFilter struct {
	SourcePage *string
	From       *time.Time
	To         *time.Time
	Status     *string
	Search     *string
}

func (f BrainFeedFilter) toListParams(page, pageSize int) db.ListBrainFeedsParams {
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	if page < 1 {
		page = 1
	}
	return db.ListBrainFeedsParams{
		SourcePage:   stringOrEmpty(f.SourcePage),
		FromT:        timePtrToPgTime(f.From),
		ToT:          timePtrToPgTime(f.To),
		StatusFilter: stringOrEmpty(f.Status),
		SearchQ:      stringOrEmpty(f.Search),
		Off:          int32((page - 1) * pageSize),
		PageSize:     int32(pageSize),
	}
}

func (f BrainFeedFilter) toCountParams() db.CountBrainFeedsParams {
	return db.CountBrainFeedsParams{
		SourcePage:   stringOrEmpty(f.SourcePage),
		FromT:        timePtrToPgTime(f.From),
		ToT:          timePtrToPgTime(f.To),
		StatusFilter: stringOrEmpty(f.Status),
		SearchQ:      stringOrEmpty(f.Search),
	}
}

// List returns a page of brain_feeds matching the filter.
func (r *BrainFeedRepo) List(ctx context.Context, f BrainFeedFilter, page, pageSize int) ([]db.FacebookBrainFeed, error) {
	return r.q.ListBrainFeeds(ctx, f.toListParams(page, pageSize))
}

// Count returns the number of brain_feeds matching the filter.
func (r *BrainFeedRepo) Count(ctx context.Context, f BrainFeedFilter) (int64, error) {
	return r.q.CountBrainFeeds(ctx, f.toCountParams())
}

// GetByID fetches a single brain_feed by its UUID.
func (r *BrainFeedRepo) GetByID(ctx context.Context, id pgtype.UUID) (db.FacebookBrainFeed, error) {
	return r.q.GetBrainFeedByID(ctx, id)
}

// GetByCrawledPostID fetches a single brain_feed by the source crawled
// post id (FB-side post id, stored as TEXT).
func (r *BrainFeedRepo) GetByCrawledPostID(ctx context.Context, crawledPostID string) (db.FacebookBrainFeed, error) {
	return r.q.GetBrainFeedByCrawledPostID(ctx, crawledPostID)
}

// Upsert inserts a new brain_feed row, or bumps updated_at on conflict.
func (r *BrainFeedRepo) Upsert(ctx context.Context, arg db.InsertBrainFeedParams) (db.FacebookBrainFeed, error) {
	return r.q.InsertBrainFeed(ctx, arg)
}

// UpdateBrainID writes the brain_content_id returned by the Brain MCP
// and moves the row into a new status (typically "generated").
func (r *BrainFeedRepo) UpdateBrainID(ctx context.Context, id pgtype.UUID, brainContentID string, status string) error {
	var brainID *string
	if brainContentID != "" {
		brainID = &brainContentID
	}
	return r.q.UpdateBrainFeedBrainID(ctx, db.UpdateBrainFeedBrainIDParams{
		ID:             id,
		BrainContentID: brainID,
		Status:         status,
	})
}

// UpdateStatus changes status (e.g. "failed" with a message) and bumps
// the retry counter.
func (r *BrainFeedRepo) UpdateStatus(ctx context.Context, id pgtype.UUID, status string, errMsg string) error {
	var msg *string
	if errMsg != "" {
		msg = &errMsg
	}
	return r.q.UpdateBrainFeedStatus(ctx, db.UpdateBrainFeedStatusParams{
		ID:           id,
		Status:       status,
		ErrorMessage: msg,
	})
}

// Delete removes a brain_feed row by id.
func (r *BrainFeedRepo) Delete(ctx context.Context, id pgtype.UUID) error {
	return r.q.DeleteBrainFeed(ctx, id)
}

// ListByIDs returns brain_feed rows whose id is in the given slice.
// Used by the Kanban layer to bulk-load feeds for a draft batch.
func (r *BrainFeedRepo) ListByIDs(ctx context.Context, ids []pgtype.UUID) ([]db.FacebookBrainFeed, error) {
	return r.q.ListBrainFeedsByIDs(ctx, ids)
}

// stringOrEmpty returns "" when s is nil so the sqlc `'' OR =` filter
// pattern treats it as "no filter".
func stringOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
