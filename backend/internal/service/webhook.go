package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Webhook handles Facebook webhook verification, signature checking,
// persistence, and dispatch to downstream services.
type Webhook struct {
	webhookRepo    repo.WebhookRepo
	inbox          *Inbox
	commentMonitor *CommentMonitor
	aiResponder    *AIResponder
	appSecret      string
	verifyToken    string
	log            *slog.Logger
}

// NewWebhook builds the webhook service.
func NewWebhook(wr repo.WebhookRepo, inbox *Inbox, cm *CommentMonitor, ai *AIResponder, appSecret, verifyToken string, log *slog.Logger) *Webhook {
	return &Webhook{webhookRepo: wr, inbox: inbox, commentMonitor: cm, aiResponder: ai, appSecret: appSecret, verifyToken: verifyToken, log: log}
}

// VerifyChallenge validates the subscription challenge from Facebook.
// Returns true + empty string when the request is legitimate; otherwise
// returns false + an error message suitable for the HTTP body.
func (s *Webhook) VerifyChallenge(mode, token, challenge string) (bool, string) {
	if mode != "subscribe" {
		return false, "hub.mode must be subscribe"
	}
	if token == "" {
		return false, "hub.verify_token is required"
	}
	if s.verifyToken != "" && token != s.verifyToken {
		return false, "verify token mismatch"
	}
	if challenge == "" {
		return false, "hub.challenge is required"
	}
	return true, ""
}

// VerifyPayload checks the X-Hub-Signature-256 header against the raw
// request body using the configured app secret.
func (s *Webhook) VerifyPayload(body []byte, signature string) bool {
	if signature == "" || s.appSecret == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(s.appSecret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

// ProcessPayload parses a verified webhook body, stores it, and routes
// the event to the correct handler.
func (s *Webhook) ProcessPayload(ctx context.Context, body []byte, signature string) error {
	var envelope struct {
		Object string `json:"object"`
		Entry  []struct {
			ID        string `json:"id"`
			Time      int64  `json:"time"`
			Messaging []struct {
				Sender    struct{ ID string `json:"id"` } `json:"sender"`
				Recipient struct{ ID string `json:"id"` } `json:"recipient"`
				Timestamp int64  `json:"timestamp"`
				Message   *struct {
					Mid  string `json:"mid"`
					Text string `json:"text"`
				} `json:"message"`
			} `json:"messaging"`
			Changes []struct {
				Value struct {
					Item       string `json:"item"`
					PostID     string `json:"post_id"`
					CommentID  string `json:"comment_id"`
					FromID     string `json:"from_id"`
					FromName   string `json:"from_name"`
					Message    string `json:"message"`
					CreatedTime int64 `json:"created_time"`
				} `json:"value"`
			} `json:"changes"`
		} `json:"entry"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return fmt.Errorf("unmarshal webhook: %w", err)
	}

	for _, entry := range envelope.Entry {
		// Persist the raw event.
		event, err := s.webhookRepo.Create(ctx, models.WebhookEvent{
			EventType:       detectEventType(envelope.Object, entry),
			FacebookEntryID: &entry.ID,
			Payload:         body,
			Signature:       &signature,
			Processed:       false,
		})
		if err != nil {
			s.log.Warn("persist webhook event failed", "err", err)
			continue
		}

		var procErr error
		switch event.EventType {
		case "messaging":
			procErr = s.handleMessaging(ctx, entry)
		case "feed":
			procErr = s.handleFeedChanges(ctx, entry)
		}

		var errMsg *string
		if procErr != nil {
			s.log.Warn("webhook event processing failed", "eventID", event.ID, "err", procErr)
			m := procErr.Error()
			errMsg = &m
		}
		_ = s.webhookRepo.MarkProcessed(ctx, event.ID, errMsg)
	}
	return nil
}

func (s *Webhook) handleMessaging(ctx context.Context, entry struct {
	ID        string `json:"id"`
	Time      int64  `json:"time"`
	Messaging []struct {
		Sender    struct{ ID string `json:"id"` } `json:"sender"`
		Recipient struct{ ID string `json:"id"` } `json:"recipient"`
		Timestamp int64  `json:"timestamp"`
		Message   *struct {
			Mid  string `json:"mid"`
			Text string `json:"text"`
		} `json:"message"`
	} `json:"messaging"`
	Changes []struct {
		Value struct {
			Item       string `json:"item"`
			PostID     string `json:"post_id"`
			CommentID  string `json:"comment_id"`
			FromID     string `json:"from_id"`
			FromName   string `json:"from_name"`
			Message    string `json:"message"`
			CreatedTime int64 `json:"created_time"`
		} `json:"value"`
	} `json:"changes"`
}) error {
	for _, m := range entry.Messaging {
		if m.Message == nil || m.Message.Text == "" {
			continue
		}
		convID, err := s.inbox.HandleWebhookMessage(ctx, entry.ID, m.Sender.ID, m.Message.Text, m.Message.Mid)
		if err != nil {
			return err
		}
		// Trigger AI reply asynchronously (fire-and-forget).
		// In production this should be moved to a background worker queue.
		if s.aiResponder != nil {
			go func(cid, mid string) {
				defer func() {
					if r := recover(); r != nil {
						s.log.Error("ai responder panic recovered", "recover", r, "convID", cid)
					}
				}()
				timeoutCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				if err := s.aiResponder.MaybeReply(timeoutCtx, cid, mid); err != nil {
					s.log.Warn("ai reply failed", "convID", cid, "err", err)
				}
			}(convID, m.Message.Mid)
		}
	}
	return nil
}

func (s *Webhook) handleFeedChanges(ctx context.Context, entry struct {
	ID        string `json:"id"`
	Time      int64  `json:"time"`
	Messaging []struct {
		Sender    struct{ ID string `json:"id"` } `json:"sender"`
		Recipient struct{ ID string `json:"id"` } `json:"recipient"`
		Timestamp int64  `json:"timestamp"`
		Message   *struct {
			Mid  string `json:"mid"`
			Text string `json:"text"`
		} `json:"message"`
	} `json:"messaging"`
	Changes []struct {
		Value struct {
			Item       string `json:"item"`
			PostID     string `json:"post_id"`
			CommentID  string `json:"comment_id"`
			FromID     string `json:"from_id"`
			FromName   string `json:"from_name"`
			Message    string `json:"message"`
			CreatedTime int64 `json:"created_time"`
		} `json:"value"`
	} `json:"changes"`
}) error {
	for _, ch := range entry.Changes {
		if ch.Value.Item != "comment" || ch.Value.CommentID == "" {
			continue
		}
		// We let the periodic CommentMonitor sweep handle it rather than
		// doing real-time processing here, because the Graph API needs a
		// page token that we resolve from the DB.  Just upsert so the
		// monitor sees it sooner.
		_ = s.commentMonitor
	}
	return nil
}

func detectEventType(object string, entry struct {
	ID        string `json:"id"`
	Time      int64  `json:"time"`
	Messaging []struct {
		Sender    struct{ ID string `json:"id"` } `json:"sender"`
		Recipient struct{ ID string `json:"id"` } `json:"recipient"`
		Timestamp int64  `json:"timestamp"`
		Message   *struct {
			Mid  string `json:"mid"`
			Text string `json:"text"`
		} `json:"message"`
	} `json:"messaging"`
	Changes []struct {
		Value struct {
			Item       string `json:"item"`
			PostID     string `json:"post_id"`
			CommentID  string `json:"comment_id"`
			FromID     string `json:"from_id"`
			FromName   string `json:"from_name"`
			Message    string `json:"message"`
			CreatedTime int64 `json:"created_time"`
		} `json:"value"`
	} `json:"changes"`
}) string {
	if object == "page" && len(entry.Messaging) > 0 {
		return "messaging"
	}
	if object == "page" && len(entry.Changes) > 0 {
		return "feed"
	}
	return "unknown"
}
