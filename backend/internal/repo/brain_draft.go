package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
)

// BrainDraftRepo wraps sqlc-generated queries for the facebook.brain_drafts
// table. Each row represents a single AI-generated draft produced by the
// Brain MCP for a parent brain_feed.
type BrainDraftRepo struct {
	q *db.Queries
}

// NewBrainDraftRepo wires a BrainDraftRepo backed by sqlc.
func NewBrainDraftRepo(q *db.Queries) *BrainDraftRepo {
	return &BrainDraftRepo{q: q}
}

// Insert stores a freshly-generated AI draft and returns the persisted row,
// including the server-assigned id and timestamps.
func (r *BrainDraftRepo) Insert(ctx context.Context, arg db.InsertBrainDraftParams) (db.FacebookBrainDraft, error) {
	return r.q.InsertBrainDraft(ctx, arg)
}

// ListByFeedIDs returns drafts whose feed_id is in the given slice,
// newest first. Used by the Kanban layer to bulk-load drafts for a
// batch of parent feeds.
func (r *BrainDraftRepo) ListByFeedIDs(ctx context.Context, feedIDs []pgtype.UUID) ([]db.FacebookBrainDraft, error) {
	return r.q.ListBrainDraftsByFeedIDs(ctx, feedIDs)
}

// MarkPushed stamps the kanban_job_id (returned by the Kanban MCP) onto
// the draft and flips status to "pushed". A blank kanbanJobID is stored
// as NULL.
func (r *BrainDraftRepo) MarkPushed(ctx context.Context, id pgtype.UUID, kanbanJobID string) error {
	var jobID *string
	if kanbanJobID != "" {
		jobID = &kanbanJobID
	}
	return r.q.UpdateBrainDraftKanbanJob(ctx, db.UpdateBrainDraftKanbanJobParams{
		ID:          id,
		KanbanJobID: jobID,
	})
}