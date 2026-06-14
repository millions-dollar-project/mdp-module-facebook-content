// Package models holds the domain types exposed to handlers.
package models

import "time"

// Conversation tracks a Messenger thread between a page and a customer.
type Conversation struct {
	ID                  string        `json:"id"`
	PageID              string        `json:"pageId"`
	CustomerID          string        `json:"customerId"`
	CustomerName        string        `json:"customerName"`
	LastMessage         *string       `json:"lastMessage,omitempty"`
	LastMessageAt       *time.Time    `json:"lastMessageAt,omitempty"`
	UnreadCount         int           `json:"unreadCount"`
	Status              string        `json:"status"`
	AIEnabled           bool          `json:"aiEnabled"`
	Contacted           bool          `json:"contacted"`
	PriorityScore       int           `json:"priorityScore"`
	ConversationSummary *string       `json:"conversationSummary,omitempty"`
	CollectedInfo       CollectedInfo `json:"collectedInfo"`
	ResetAt             *time.Time    `json:"resetAt,omitempty"`
	CreatedAt           time.Time     `json:"createdAt"`
	UpdatedAt           time.Time     `json:"updatedAt"`
}

// CollectedInfo holds structured data extracted from conversation turns.
type CollectedInfo struct {
	Name      *string `json:"name,omitempty"`
	Phone     *string `json:"phone,omitempty"`
	Zalo      *string `json:"zalo,omitempty"`
	Email     *string `json:"email,omitempty"`
	Address   *string `json:"address,omitempty"`
	Location  *string `json:"location,omitempty"`
	Area      *string `json:"area,omitempty"`
	SchoolType *string `json:"schoolType,omitempty"`
	Budget    *string `json:"budget,omitempty"`
	Style     *string `json:"style,omitempty"`
	Needs     *string `json:"needs,omitempty"`
}

// Message is a single turn in a conversation.
type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversationId"`
	SenderID       string    `json:"senderId"`
	SenderType     string    `json:"senderType"`
	Content        string    `json:"content"`
	MessageType    string    `json:"messageType"`
	IsFromPage     bool      `json:"isFromPage"`
	IsAi           bool      `json:"isAi"`
	IsRead         bool      `json:"isRead"`
	SentAt         time.Time `json:"sentAt"`
	CreatedAt      time.Time `json:"createdAt"`
}

// AIReplied tracks which inbound messages have already received an AI reply.
type AIReplied struct {
	InboundMessageID  string    `json:"inboundMessageId"`
	OutboundMessageID *string   `json:"outboundMessageId,omitempty"`
	ConversationID    string    `json:"conversationId"`
	RepliedAt         time.Time `json:"repliedAt"`
}
