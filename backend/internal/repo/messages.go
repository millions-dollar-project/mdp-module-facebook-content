package repo

import (
	"context"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// MessagesRepo is a lightweight contract for message persistence.
type MessagesRepo interface {
	ListByConversation(ctx context.Context, conversationID string, limit int32) ([]models.Message, error)
	Insert(ctx context.Context, in models.Message) error
	Get(ctx context.Context, id string) (models.Message, error)
	CountAITurns(ctx context.Context, conversationID string) (int64, error)
}

type messagesRepo struct{ q *db.Queries }

// NewMessagesRepo wires a Postgres-backed messages repo.
func NewMessagesRepo(q *db.Queries) MessagesRepo { return &messagesRepo{q: q} }

func (r *messagesRepo) ListByConversation(ctx context.Context, conversationID string, limit int32) ([]models.Message, error) {
	rows, err := r.q.ListMessages(ctx, db.ListMessagesParams{
		ConversationID: stringToUUID(conversationID),
		Limit:          limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.Message, 0, len(rows))
	for _, row := range rows {
		out = append(out, messageFromRow(row))
	}
	return out, nil
}

func (r *messagesRepo) Insert(ctx context.Context, in models.Message) error {
	return r.q.InsertMessage(ctx, db.InsertMessageParams{
		ID:             in.ID,
		ConversationID: stringToUUID(in.ConversationID),
		SenderID:       in.SenderID,
		SenderType:     in.SenderType,
		Content:        in.Content,
		MessageType:    in.MessageType,
		IsFromPage:     in.IsFromPage,
		IsAiGenerated:  in.IsAi,
		IsRead:         in.IsRead,
		SentAt:         timeToPgTime(in.SentAt),
	})
}

func (r *messagesRepo) Get(ctx context.Context, id string) (models.Message, error) {
	row, err := r.q.GetMessage(ctx, id)
	if err != nil {
		return models.Message{}, err
	}
	return messageFromRow(row), nil
}

func (r *messagesRepo) CountAITurns(ctx context.Context, conversationID string) (int64, error) {
	return r.q.CountAITurns(ctx, stringToUUID(conversationID))
}

func messageFromRow(r db.FacebookMessage) models.Message {
	return models.Message{
		ID:             r.ID,
		ConversationID: uuidToString(r.ConversationID),
		SenderID:       r.SenderID,
		SenderType:     r.SenderType,
		Content:        r.Content,
		MessageType:    r.MessageType,
		IsFromPage:     r.IsFromPage,
		IsAi:           r.IsAiGenerated,
		IsRead:         r.IsRead,
		SentAt:         pgTimeToTime(r.SentAt),
		CreatedAt:      pgTimeToTime(r.CreatedAt),
	}
}
