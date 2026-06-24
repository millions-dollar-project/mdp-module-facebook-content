package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
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

// CountByStatus returns feed counts grouped by status. Used by the
// BrainStatsService to compute dashboard overview counters.
func (r *BrainFeedRepo) CountByStatus(ctx context.Context) (map[string]int64, error) {
	statuses := []string{"ingested", "generated", "pushed", "failed"}
	out := map[string]int64{}
	for _, st := range statuses {
		s := st
		n, err := r.Count(ctx, BrainFeedFilter{Status: &s})
		if err != nil {
			return nil, err
		}
		out[st] = n
	}
	return out, nil
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

// -----------------------------------------------------------------------------
// Model-based adapter methods
//
// The service layer (internal/service) operates on domain models from
// internal/models so it does not need to know about pgtype.* or sqlc JSON
// encoding. These *Row methods convert between models and sqlc types so the
// service can satisfy the BrainFeedStore interface via a *BrainFeedRepo.
// -----------------------------------------------------------------------------

// UpsertRow inserts (or bumps updated_at on conflict) a brain_feed from a
// domain model and returns the persisted row as a model.
func (r *BrainFeedRepo) UpsertRow(ctx context.Context, row models.BrainFeedRow) (models.BrainFeedRow, error) {
	dbRow, err := r.Upsert(ctx, db.InsertBrainFeedParams{
		CrawledPostID: row.CrawledPostID,
		PageID:        row.PageID,
		PageName:      strPtrOrNil(row.PageName),
		Content:       row.Content,
		MediaUrls:     stringSliceToBytes(row.MediaURLs),
		VideoUrls:     stringSliceToBytes(row.VideoURLs),
		ThumbnailUrls: stringSliceToBytes(row.ThumbnailURLs),
		FullPicture:   strPtrOrNil(row.FullPicture),
		MediaType:     row.MediaType,
		Likes:         int32(row.Likes),
		Comments:      int32(row.Comments),
		Shares:        int32(row.Shares),
		PostedAt:      timeToPgTime(row.PostedAt),
		SourceUrl:     row.SourceURL,
		Permalink:     row.Permalink,
		Status:        row.Status,
	})
	if err != nil {
		return models.BrainFeedRow{}, err
	}
	return facebookBrainFeedToModel(dbRow), nil
}

// UpdateBrainIDRow is the string-id version of UpdateBrainID used by the
// service layer.
func (r *BrainFeedRepo) UpdateBrainIDRow(ctx context.Context, id string, brainID string, status string) error {
	return r.UpdateBrainID(ctx, stringToUUID(id), brainID, status)
}

// UpdateStatusRow is the string-id version of UpdateStatus used by the
// service layer.
func (r *BrainFeedRepo) UpdateStatusRow(ctx context.Context, id string, status string, errMsg string) error {
	return r.UpdateStatus(ctx, stringToUUID(id), status, errMsg)
}

// GetByIDRow fetches a brain_feed by its UUID string and returns it as
// a domain model.
func (r *BrainFeedRepo) GetByIDRow(ctx context.Context, id string) (models.BrainFeedRow, error) {
	dbRow, err := r.GetByID(ctx, stringToUUID(id))
	if err != nil {
		return models.BrainFeedRow{}, err
	}
	return facebookBrainFeedToModel(dbRow), nil
}

// ListRows returns a page of brain_feeds as domain models.
func (r *BrainFeedRepo) ListRows(ctx context.Context, f BrainFeedFilter, page, pageSize int) ([]models.BrainFeedRow, error) {
	dbRows, err := r.List(ctx, f, page, pageSize)
	if err != nil {
		return nil, err
	}
	out := make([]models.BrainFeedRow, 0, len(dbRows))
	for _, dbRow := range dbRows {
		out = append(out, facebookBrainFeedToModel(dbRow))
	}
	return out, nil
}

// DeleteRow removes a brain_feed by its UUID string.
func (r *BrainFeedRepo) DeleteRow(ctx context.Context, id string) error {
	return r.Delete(ctx, stringToUUID(id))
}

// -----------------------------------------------------------------------------
// Conversion helpers
// -----------------------------------------------------------------------------

// strPtrOrNil returns nil for the empty string so the sqlc `*string` stays
// NULL when the model has no value.
func strPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// facebookBrainFeedToModel converts a sqlc-generated row into the
// service-layer domain model.
func facebookBrainFeedToModel(r db.FacebookBrainFeed) models.BrainFeedRow {
	return models.BrainFeedRow{
		ID:             uuidToString(r.ID),
		CrawledPostID:  r.CrawledPostID,
		PageID:         r.PageID,
		PageName:       strDeref(r.PageName),
		Content:        r.Content,
		MediaURLs:      bytesToStringSlice(r.MediaUrls),
		VideoURLs:      bytesToStringSlice(r.VideoUrls),
		ThumbnailURLs:  bytesToStringSlice(r.ThumbnailUrls),
		FullPicture:    strDeref(r.FullPicture),
		MediaType:      r.MediaType,
		Likes:          int(r.Likes),
		Comments:       int(r.Comments),
		Shares:         int(r.Shares),
		PostedAt:       pgTimeToTime(r.PostedAt),
		SourceURL:      r.SourceUrl,
		Permalink:      r.Permalink,
		BrainContentID: strDeref(r.BrainContentID),
		IngestedAt:     pgTimeToTime(r.IngestedAt),
		Status:         r.Status,
	}
}

func strDeref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
