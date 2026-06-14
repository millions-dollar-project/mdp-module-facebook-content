// Package models holds the domain types exposed to handlers.
package models

import "time"

// Comment is a Facebook post comment (from Graph API or scraper).
type Comment struct {
	ID                  string       `json:"id"`
	PostID              string       `json:"postId"`
	PageID              string       `json:"pageId"`
	FromID              *string      `json:"fromId,omitempty"`
	FromName            string       `json:"fromName"`
	Message             string       `json:"message"`
	CreatedTime         *time.Time   `json:"createdTime,omitempty"`
	LikeCount           int          `json:"likeCount"`
	ReplyCount          int          `json:"replyCount"`
	Sentiment           string       `json:"sentiment"`
	Intent              string       `json:"intent"`
	Priority            int          `json:"priority"`
	IsHidden            bool         `json:"isHidden"`
	IsLiked             bool         `json:"isLiked"`
	IsPrivateReplySent  bool         `json:"isPrivateReplySent"`
	CollectedInfo       CollectedInfo `json:"collectedInfo"`
	ReceivedAt          time.Time    `json:"receivedAt"`
	ClaimedAt           *time.Time   `json:"claimedAt,omitempty"`
	ClaimedBy           *string      `json:"claimedBy,omitempty"`
	Processed           bool         `json:"processed"`
}

// CommentReply tracks public or private replies sent to a comment.
type CommentReply struct {
	ID              string    `json:"id"`
	CommentID       string    `json:"commentId"`
	ReplyType       string    `json:"replyType"`
	Content         string    `json:"content"`
	SentBy          string    `json:"sentBy"`
	Status          string    `json:"status"`
	FacebookReplyID *string   `json:"facebookReplyId,omitempty"`
	SentAt          time.Time `json:"sentAt"`
}

// CommentAnalysis is the result of AI/keyword analysis on a comment.
type CommentAnalysis struct {
	Sentiment            string       `json:"sentiment"`
	Intent               string       `json:"intent"`
	Priority             int          `json:"priority"`
	ShouldLike           bool         `json:"shouldLike"`
	ShouldReplyPublic    bool         `json:"shouldReplyPublic"`
	ShouldSendPrivateMessage bool     `json:"shouldSendPrivateMessage"`
	CollectedInfo        CollectedInfo `json:"collectedInfo"`
}

// WebhookEvent is a raw Facebook webhook delivery.
type WebhookEvent struct {
	ID              string    `json:"id"`
	EventType       string    `json:"eventType"`
	FacebookEntryID *string   `json:"facebookEntryId,omitempty"`
	Payload         []byte    `json:"payload"`
	Signature       *string   `json:"signature,omitempty"`
	Processed       bool      `json:"processed"`
	ProcessedAt     *time.Time `json:"processedAt,omitempty"`
	ErrorMessage    *string   `json:"errorMessage,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
}
