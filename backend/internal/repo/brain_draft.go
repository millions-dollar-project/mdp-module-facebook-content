package repo

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
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

// BrainDraftFilter holds optional filter values for Count. A nil Status
// means "count all drafts"; a non-nil Status means "count drafts where
// status = the value".
type BrainDraftFilter struct {
	Status *string
}

// Count returns the number of brain_drafts matching the filter.
func (r *BrainDraftRepo) Count(ctx context.Context, f BrainDraftFilter) (int64, error) {
	return r.q.CountBrainDrafts(ctx, db.CountBrainDraftsParams{
		StatusFilter: stringOrEmpty(f.Status),
	})
}

// CountDraftsByStatus returns draft counts grouped by status. Used by
// the BrainStatsService to compute dashboard overview counters.
func (r *BrainDraftRepo) CountDraftsByStatus(ctx context.Context) (map[string]int64, error) {
	statuses := []string{"pending", "approved", "rejected", "blocked"}
	out := map[string]int64{}
	for _, st := range statuses {
		s := st
		n, err := r.Count(ctx, BrainDraftFilter{Status: &s})
		if err != nil {
			return nil, err
		}
		out[st] = n
	}
	return out, nil
}

// -----------------------------------------------------------------------------
// Model-based adapter methods
//
// The service layer (internal/service) operates on domain models from
// internal/models so it does not need to know about pgtype.* or sqlc JSON
// encoding. These *Row methods convert between models and sqlc types so the
// service can satisfy the BrainDraftStore interface via a *BrainDraftRepo.
// -----------------------------------------------------------------------------

// InsertRow inserts a brain_draft from a domain model and returns the
// persisted row as a model. ValidationDetails and Warnings default to empty
// JSON arrays when not supplied.
func (r *BrainDraftRepo) InsertRow(ctx context.Context, row models.BrainDraftRow) (models.BrainDraftRow, error) {
	dbRow, err := r.Insert(ctx, db.InsertBrainDraftParams{
		FeedID:            stringToUUID(row.FeedID),
		Content:           row.Content,
		ProvenanceID:      row.ProvenanceID,
		ValidationStatus:  row.ValidationStatus,
		ValidationDetails: stringSliceToBytes(nil), // default empty array
		Warnings:          stringSliceToBytes(row.Warnings),
		Status:            row.Status,
	})
	if err != nil {
		return models.BrainDraftRow{}, err
	}
	return facebookBrainDraftToModel(dbRow), nil
}

// MarkPushedRow is the string-id version of MarkPushed used by the service layer.
func (r *BrainDraftRepo) MarkPushedRow(ctx context.Context, id string, kanbanJobID string) error {
	uid := stringToUUID(id)
	return r.MarkPushed(ctx, uid, kanbanJobID)
}

// -----------------------------------------------------------------------------
// Conversion helpers
// -----------------------------------------------------------------------------

// facebookBrainDraftToModel converts a sqlc-generated row into the
// service-layer domain model.
func facebookBrainDraftToModel(r db.FacebookBrainDraft) models.BrainDraftRow {
	return models.BrainDraftRow{
		ID:               uuidToString(r.ID),
		FeedID:           uuidToString(r.FeedID),
		Content:          r.Content,
		ProvenanceID:     r.ProvenanceID,
		ValidationStatus: r.ValidationStatus,
		Warnings:         bytesToStringSlice(r.Warnings),
		KanbanJobID:      strDeref(r.KanbanJobID),
		Status:           r.Status,
	}
}

// jsonRawOrEmpty ensures we always pass valid JSON bytes to jsonb columns.
func jsonRawOrEmpty(b []byte) []byte {
	if len(b) == 0 {
		return []byte("[]")
	}
	// Validate it's actually JSON; fall back to "[]" if not.
	var x interface{}
	if err := json.Unmarshal(b, &x); err != nil {
		return []byte("[]")
	}
	return b
}
