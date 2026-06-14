package service

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Inbox handles conversation / message sync and outbound sends.
type Inbox struct {
	convRepo   repo.ConversationsRepo
	msgRepo    repo.MessagesRepo
	pagesRepo  repo.PagesRepo
	graph      *fb.Client
	log        *slog.Logger
}

// NewInbox builds the Inbox service.
func NewInbox(conv repo.ConversationsRepo, msg repo.MessagesRepo, pages repo.PagesRepo, graph *fb.Client, log *slog.Logger) *Inbox {
	return &Inbox{convRepo: conv, msgRepo: msg, pagesRepo: pages, graph: graph, log: log}
}

// SyncConversations pulls the latest Messenger threads from Facebook and
// upserts them into the local DB.
func (s *Inbox) SyncConversations(ctx context.Context, pageID string) error {
	page, err := s.pagesRepo.GetByFBID(ctx, pageID)
	if err != nil {
		return err
	}
	threads, err := s.graph.GetConversations(ctx, page.PageID, page.PageAccessToken, 50)
	if err != nil {
		return err
	}
	for _, t := range threads {
		// Find the customer participant (not the page).
		var cust fb.ConversationParticipant
		for _, p := range t.Participants.Data {
			if p.ID != page.PageID {
				cust = p
				break
			}
		}
		if cust.ID == "" {
			continue
		}
		preview := ""
		if t.Link != "" {
			preview = "New conversation"
		}
		conv, err := s.convRepo.GetByCustomer(ctx, page.ID, cust.ID)
		if errors.Is(err, repo.ErrNotFound) {
			_, err = s.convRepo.Create(ctx, models.Conversation{
				PageID:             page.ID,
				CustomerID:         cust.ID,
				CustomerName:       cust.Name,
				LastMessage:      &preview,
				LastMessageAt:    ptrTime(t.UpdatedTime.Time()),
				UnreadCount:        t.UnreadCount,
				Status:             "open",
				AIEnabled:          true,
				PriorityScore:      50,
			})
			if err != nil {
				s.log.Warn("create conversation failed", "customerID", cust.ID, "err", err)
			}
		} else if err == nil {
			_ = s.convRepo.UpdatePreview(ctx, conv.ID, &preview, t.UpdatedTime.Time(), int32(t.UnreadCount))
		}
	}
	return nil
}

// SyncMessages fetches recent messages for a conversation thread.
func (s *Inbox) SyncMessages(ctx context.Context, localConvID, fbConvID string, limit int) error {
	conv, err := s.convRepo.Get(ctx, localConvID)
	if err != nil {
		return err
	}
	page, err := s.pagesRepo.GetByFBID(ctx, conv.PageID)
	if err != nil {
		return err
	}
	msgs, err := s.graph.GetMessages(ctx, fbConvID, page.PageAccessToken, limit)
	if err != nil {
		return err
	}
	for _, m := range msgs {
		isFromPage := m.From.ID == page.PageID
		senderType := "customer"
		if isFromPage {
			senderType = "page"
		}
		_ = s.msgRepo.Insert(ctx, models.Message{
			ID:             m.ID,
			ConversationID: localConvID,
			SenderID:       m.From.ID,
			SenderType:     senderType,
			Content:        m.Message,
			MessageType:    "text",
			IsFromPage:     isFromPage,
			IsAi:           false,
			IsRead:         isFromPage,
			SentAt:         m.CreatedTime,
		})
	}
	return nil
}

// HandleWebhookMessage is called when a messaging webhook delivers a new
// text message. It ensures the conversation row exists, persists the
// inbound message, and returns the conversation ID so the caller can
// decide whether to trigger an AI reply.
func (s *Inbox) HandleWebhookMessage(ctx context.Context, pageFBID, senderID, text, mid string) (string, error) {
	// Idempotency: skip if this Facebook message ID was already processed.
	var existing models.Message
	if err := db.Retry(ctx, 3, 100*time.Millisecond, func() error {
		var err error
		existing, err = s.msgRepo.Get(ctx, mid)
		return err
	}); err == nil {
		s.log.Debug("webhook message already processed, skipping", "mid", mid)
		return existing.ConversationID, nil
	}

	var page models.Page
	if err := db.Retry(ctx, 3, 100*time.Millisecond, func() error {
		var err error
		page, err = s.pagesRepo.GetByFBID(ctx, pageFBID)
		return err
	}); err != nil {
		return "", err
	}

	var conv models.Conversation
	if err := db.Retry(ctx, 3, 100*time.Millisecond, func() error {
		var err error
		conv, err = s.convRepo.GetByCustomer(ctx, page.ID, senderID)
		return err
	}); errors.Is(err, repo.ErrNotFound) {
		if err := db.Retry(ctx, 3, 100*time.Millisecond, func() error {
			var createErr error
			conv, createErr = s.convRepo.Create(ctx, models.Conversation{
				PageID:        page.ID,
				CustomerID:    senderID,
				CustomerName:  "Khách ẩn danh",
				LastMessage:   &text,
				LastMessageAt: ptrTimeNow(),
				Status:        "open",
				AIEnabled:     true,
				PriorityScore: 50,
			})
			return createErr
		}); err != nil {
			return "", err
		}
	} else if err != nil {
		return "", err
	}

	_ = db.Retry(ctx, 3, 100*time.Millisecond, func() error {
		return s.convRepo.UpdatePreview(ctx, conv.ID, &text, time.Now(), 1)
	})

	msg := models.Message{
		ID:             mid,
		ConversationID: conv.ID,
		SenderID:       senderID,
		SenderType:     "customer",
		Content:        text,
		MessageType:    "text",
		IsFromPage:     false,
		IsAi:           false,
		IsRead:         false,
		SentAt:         time.Now(),
	}
	s.log.Debug("insert inbound message", "mid", mid, "convID", conv.ID, "content", scrubPII(text))
	if err := db.Retry(ctx, 3, 100*time.Millisecond, func() error {
		return s.msgRepo.Insert(ctx, msg)
	}); err != nil {
		s.log.Warn("insert inbound message failed", "mid", mid, "err", err)
	}
	return conv.ID, nil
}

// GetMessages returns recent messages for a conversation.
func (s *Inbox) GetMessages(ctx context.Context, convID string, limit int32) ([]models.Message, error) {
	return s.msgRepo.ListByConversation(ctx, convID, limit)
}

// SendMessage sends a text message via the Graph API and persists it.
func (s *Inbox) SendMessage(ctx context.Context, convID, text string, isAI bool) (string, error) {
	var conv models.Conversation
	if err := db.Retry(ctx, 3, 100*time.Millisecond, func() error {
		var err error
		conv, err = s.convRepo.Get(ctx, convID)
		return err
	}); err != nil {
		return "", err
	}
	var page models.Page
	if err := db.Retry(ctx, 3, 100*time.Millisecond, func() error {
		var err error
		page, err = s.pagesRepo.GetByFBID(ctx, conv.PageID)
		return err
	}); err != nil {
		return "", err
	}
	mid, err := s.graph.SendTextMessage(ctx, page.PageID, conv.CustomerID, text, page.PageAccessToken)
	if err != nil {
		return "", err
	}
	msg := models.Message{
		ID:             mid,
		ConversationID: convID,
		SenderID:       page.PageID,
		SenderType:     "page",
		Content:        text,
		MessageType:    "text",
		IsFromPage:     true,
		IsAi:           isAI,
		IsRead:         true,
		SentAt:         time.Now(),
	}
	s.log.Debug("insert outbound message", "mid", mid, "convID", convID, "content", scrubPII(text), "isAI", isAI)
	if err := db.Retry(ctx, 3, 100*time.Millisecond, func() error {
		return s.msgRepo.Insert(ctx, msg)
	}); err != nil {
		s.log.Warn("insert outbound message failed", "mid", mid, "err", err)
	}
	_ = db.Retry(ctx, 3, 100*time.Millisecond, func() error {
		return s.convRepo.UpdatePreview(ctx, convID, &text, time.Now(), 0)
	})
	return mid, nil
}

func ptrTimeNow() *time.Time {
	t := time.Now()
	return &t
}

func ptrTime(t time.Time) *time.Time {
	return &t
}
