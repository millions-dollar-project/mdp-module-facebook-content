package repo

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// WebhookRepo is the contract for webhook event persistence.
type WebhookRepo interface {
	Create(ctx context.Context, in models.WebhookEvent) (models.WebhookEvent, error)
	Get(ctx context.Context, id string) (models.WebhookEvent, error)
	MarkProcessed(ctx context.Context, id string, errMsg *string) error
	ListUnprocessed(ctx context.Context, limit int32) ([]models.WebhookEvent, error)
}

type webhookRepo struct{ q *db.Queries }

// NewWebhookRepo wires a Postgres-backed webhook repo.
func NewWebhookRepo(q *db.Queries) WebhookRepo { return &webhookRepo{q: q} }

func (r *webhookRepo) Create(ctx context.Context, in models.WebhookEvent) (models.WebhookEvent, error) {
	var fbEntryID *string
	if in.FacebookEntryID != nil && *in.FacebookEntryID != "" {
		fbEntryID = in.FacebookEntryID
	}
	row, err := r.q.InsertWebhookEvent(ctx, db.InsertWebhookEventParams{
		EventType:       in.EventType,
		FacebookEntryID: fbEntryID,
		Payload:         json.RawMessage(in.Payload),
		Signature:       in.Signature,
		Processed:       in.Processed,
		ProcessedAt:     timePtrToPgTime(in.ProcessedAt),
		ErrorMessage:    in.ErrorMessage,
	})
	if err != nil {
		return models.WebhookEvent{}, err
	}
	return webhookEventFromRow(row), nil
}

func (r *webhookRepo) Get(ctx context.Context, id string) (models.WebhookEvent, error) {
	row, err := r.q.GetWebhookEvent(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.WebhookEvent{}, ErrNotFound
		}
		return models.WebhookEvent{}, err
	}
	return webhookEventFromRow(row), nil
}

func (r *webhookRepo) MarkProcessed(ctx context.Context, id string, errMsg *string) error {
	return r.q.MarkWebhookProcessed(ctx, db.MarkWebhookProcessedParams{
		ID:           stringToUUID(id),
		ErrorMessage: errMsg,
	})
}

func (r *webhookRepo) ListUnprocessed(ctx context.Context, limit int32) ([]models.WebhookEvent, error) {
	rows, err := r.q.ListUnprocessedWebhookEvents(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]models.WebhookEvent, 0, len(rows))
	for _, row := range rows {
		out = append(out, webhookEventFromRow(row))
	}
	return out, nil
}

func webhookEventFromRow(r db.FacebookWebhookEvent) models.WebhookEvent {
	return models.WebhookEvent{
		ID:              uuidToString(r.ID),
		EventType:       r.EventType,
		FacebookEntryID: r.FacebookEntryID,
		Payload:         []byte(r.Payload),
		Signature:       r.Signature,
		Processed:       r.Processed,
		ProcessedAt:     ptrTime(pgTimeToTime(r.ProcessedAt)),
		ErrorMessage:    r.ErrorMessage,
		CreatedAt:       pgTimeToTime(r.CreatedAt),
	}
}
