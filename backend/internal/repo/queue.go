package repo

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

type queueRepo struct{ q *db.Queries }

// QueueRepo is the contract the service layer depends on.
type QueueRepo interface {
	List(ctx context.Context) ([]models.QueueItem, error)
	Get(ctx context.Context, id string) (models.QueueItem, error)
	UpdateStatus(ctx context.Context, id string, status models.QueueStatus) (models.QueueItem, error)
	UpdateContent(ctx context.Context, id, content string) (models.QueueItem, error)
	Delete(ctx context.Context, id string) error
}

// NewQueueRepo wires a QueueRepo backed by sqlc.
func NewQueueRepo(q *db.Queries) QueueRepo { return &queueRepo{q: q} }

func (r *queueRepo) List(ctx context.Context) ([]models.QueueItem, error) {
	rows, err := r.q.ListQueue(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]models.QueueItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, queueFromRow(row))
	}
	return out, nil
}

func (r *queueRepo) Get(ctx context.Context, id string) (models.QueueItem, error) {
	row, err := r.q.GetQueueItem(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.QueueItem{}, ErrNotFound
		}
		return models.QueueItem{}, err
	}
	return queueFromRow(row), nil
}

func (r *queueRepo) UpdateStatus(ctx context.Context, id string, status models.QueueStatus) (models.QueueItem, error) {
	row, err := r.q.UpdateQueueStatus(ctx, db.UpdateQueueStatusParams{
		ID:     stringToUUID(id),
		Status: string(status),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.QueueItem{}, ErrNotFound
		}
		return models.QueueItem{}, err
	}
	return queueFromRow(row), nil
}

// UpdateContent replaces the content (used by regenerate-content echo stub).
// We piggy-back on the existing UpdateQueueStatus for the row shape — the
// stub doesn't add a new query, it issues a direct UPDATE via the queries
// package here to keep all queue writes in one file.
func (r *queueRepo) UpdateContent(ctx context.Context, id, content string) (models.QueueItem, error) {
	row, err := r.q.UpdateQueueContent(ctx, db.UpdateQueueContentParams{
		ID:      stringToUUID(id),
		Content: content,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.QueueItem{}, ErrNotFound
		}
		return models.QueueItem{}, err
	}
	return queueFromRow(row), nil
}

func (r *queueRepo) Delete(ctx context.Context, id string) error {
	if err := r.q.DeleteQueueItem(ctx, stringToUUID(id)); err != nil {
		return err
	}
	return nil
}

func queueFromRow(r db.FacebookContentQueue) models.QueueItem {
	media := json.RawMessage(r.MediaUrls)
	if len(media) == 0 {
		media = json.RawMessage("[]")
	}
	var pageID *string
	if r.PageID.Valid {
		s := uuidToString(r.PageID)
		pageID = &s
	}
	return models.QueueItem{
		ID:               uuidToString(r.ID),
		PageID:           pageID,
		Content:          r.Content,
		ImageURL:         r.ImageUrl,
		MediaURLs:        media,
		Source:           models.QueueSource(r.Source),
		Status:           models.QueueStatus(r.Status),
		TrendID:          r.TrendID,
		PromptTemplateID: r.PromptTemplateID,
		CreatedAt:        pgTimeToTime(r.CreatedAt),
		UpdatedAt:        pgTimeToTime(r.UpdatedAt),
	}
}
