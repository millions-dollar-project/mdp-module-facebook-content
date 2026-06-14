package repo

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// ConversationsRepo is the contract for conversation data access.
type ConversationsRepo interface {
	ListByPage(ctx context.Context, pageID string, limit int32) ([]models.Conversation, error)
	Get(ctx context.Context, id string) (models.Conversation, error)
	GetByCustomer(ctx context.Context, pageID, customerID string) (models.Conversation, error)
	Create(ctx context.Context, in models.Conversation) (models.Conversation, error)
	UpdatePreview(ctx context.Context, id string, preview *string, lastMsgTime interface{}, unreadDelta int32) error
	MarkRead(ctx context.Context, id string) error
	ToggleAI(ctx context.Context, id string, enabled bool) error
	MarkContacted(ctx context.Context, id string, contacted bool) error
	UpdateSummary(ctx context.Context, id string, summary *string, info models.CollectedInfo) error
	ResetTurns(ctx context.Context, id string) error
	ScanConversationsNeedingReply(ctx context.Context, pageID string, limit int32) ([]models.Conversation, error)
}

type conversationsRepo struct{ q *db.Queries }

// NewConversationsRepo wires a Postgres-backed conversations repo.
func NewConversationsRepo(q *db.Queries) ConversationsRepo { return &conversationsRepo{q: q} }

func (r *conversationsRepo) ListByPage(ctx context.Context, pageID string, limit int32) ([]models.Conversation, error) {
	rows, err := r.q.ListConversations(ctx, db.ListConversationsParams{
		PageID: stringToUUID(pageID),
		Limit:  limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.Conversation, 0, len(rows))
	for _, row := range rows {
		out = append(out, conversationFromRow(row))
	}
	return out, nil
}

func (r *conversationsRepo) Get(ctx context.Context, id string) (models.Conversation, error) {
	row, err := r.q.GetConversation(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Conversation{}, ErrNotFound
		}
		return models.Conversation{}, err
	}
	return conversationFromRow(row), nil
}

func (r *conversationsRepo) GetByCustomer(ctx context.Context, pageID, customerID string) (models.Conversation, error) {
	row, err := r.q.GetConversationByCustomer(ctx, db.GetConversationByCustomerParams{
		PageID:     stringToUUID(pageID),
		CustomerID: customerID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Conversation{}, ErrNotFound
		}
		return models.Conversation{}, err
	}
	return conversationFromRow(row), nil
}

func (r *conversationsRepo) Create(ctx context.Context, in models.Conversation) (models.Conversation, error) {
	row, err := r.q.CreateConversation(ctx, db.CreateConversationParams{
		PageID:             stringToUUID(in.PageID),
		CustomerID:         in.CustomerID,
		CustomerName:       in.CustomerName,
		LastMessagePreview: in.LastMessage,
		LastMessageTime:    timePtrToPgTime(in.LastMessageAt),
		Status:             in.Status,
		AiEnabled:          in.AIEnabled,
		PriorityScore:      int32(in.PriorityScore),
		CollectedInfo:      collectedInfoToRaw(in.CollectedInfo),
		ResetAt:            timePtrToPgTime(in.ResetAt),
	})
	if err != nil {
		return models.Conversation{}, err
	}
	return conversationFromRow(row), nil
}

func (r *conversationsRepo) UpdatePreview(ctx context.Context, id string, preview *string, lastMsgTime interface{}, unreadDelta int32) error {
	var t pgtype.Timestamptz
	switch v := lastMsgTime.(type) {
	case *time.Time:
		t = timePtrToPgTime(v)
	case time.Time:
		t = timeToPgTime(v)
	}
	return r.q.UpdateConversationPreview(ctx, db.UpdateConversationPreviewParams{
		ID:                 stringToUUID(id),
		LastMessagePreview: preview,
		LastMessageTime:    t,
		UnreadCount:        unreadDelta,
	})
}

func (r *conversationsRepo) MarkRead(ctx context.Context, id string) error {
	return r.q.MarkConversationRead(ctx, stringToUUID(id))
}

func (r *conversationsRepo) ToggleAI(ctx context.Context, id string, enabled bool) error {
	return r.q.ToggleConversationAI(ctx, db.ToggleConversationAIParams{
		ID:        stringToUUID(id),
		AiEnabled: enabled,
	})
}

func (r *conversationsRepo) MarkContacted(ctx context.Context, id string, contacted bool) error {
	return r.q.MarkConversationContacted(ctx, db.MarkConversationContactedParams{
		ID:        stringToUUID(id),
		Contacted: contacted,
	})
}

func (r *conversationsRepo) UpdateSummary(ctx context.Context, id string, summary *string, info models.CollectedInfo) error {
	return r.q.UpdateConversationSummary(ctx, db.UpdateConversationSummaryParams{
		ID:                  stringToUUID(id),
		ConversationSummary: summary,
		CollectedInfo:       collectedInfoToRaw(info),
	})
}

func (r *conversationsRepo) ResetTurns(ctx context.Context, id string) error {
	return r.q.ResetConversationTurns(ctx, stringToUUID(id))
}

func (r *conversationsRepo) ScanConversationsNeedingReply(ctx context.Context, pageID string, limit int32) ([]models.Conversation, error) {
	rows, err := r.q.ScanConversationsNeedingReply(ctx, db.ScanConversationsNeedingReplyParams{
		PageID: stringToUUID(pageID),
		Limit:  limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.Conversation, 0, len(rows))
	for _, row := range rows {
		out = append(out, conversationFromRow(row))
	}
	return out, nil
}

func conversationFromRow(r db.FacebookConversation) models.Conversation {
	return models.Conversation{
		ID:                  uuidToString(r.ID),
		PageID:              uuidToString(r.PageID),
		CustomerID:          r.CustomerID,
		CustomerName:        r.CustomerName,
		LastMessage:         r.LastMessagePreview,
		LastMessageAt:       ptrTime(pgTimeToTime(r.LastMessageTime)),
		UnreadCount:         int(r.UnreadCount),
		Status:              r.Status,
		AIEnabled:           r.AiEnabled,
		Contacted:           r.Contacted,
		PriorityScore:       int(r.PriorityScore),
		ConversationSummary: r.ConversationSummary,
		CollectedInfo:       rawToCollectedInfo(r.CollectedInfo),
		ResetAt:             ptrTime(pgTimeToTime(r.ResetAt)),
		CreatedAt:           pgTimeToTime(r.CreatedAt),
		UpdatedAt:           pgTimeToTime(r.UpdatedAt),
	}
}

func collectedInfoToRaw(c models.CollectedInfo) json.RawMessage {
	b, _ := json.Marshal(c)
	if b == nil {
		return []byte("{}")
	}
	return b
}

func rawToCollectedInfo(r json.RawMessage) models.CollectedInfo {
	var c models.CollectedInfo
	if len(r) == 0 {
		return c
	}
	_ = json.Unmarshal(r, &c)
	return c
}

func ptrTime(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}
