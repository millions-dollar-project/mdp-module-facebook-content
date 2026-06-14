package models

import (
	"encoding/json"
	"time"
)

// QueueStatus matches the CHECK constraint on facebook.content_queue.status.
type QueueStatus string

const (
	QueueStatusNew       QueueStatus = "NEW"
	QueueStatusDrafting  QueueStatus = "DRAFTING"
	QueueStatusReview    QueueStatus = "REVIEW"
	QueueStatusReady     QueueStatus = "READY"
	QueueStatusPublished QueueStatus = "PUBLISHED"
	QueueStatusRejected  QueueStatus = "REJECTED"
)

// QueueSource matches the CHECK constraint on facebook.content_queue.source.
type QueueSource string

const (
	QueueSourceManual   QueueSource = "manual"
	QueueSourceAI       QueueSource = "ai"
	QueueSourceRepost   QueueSource = "repost"
	QueueSourceCampaign QueueSource = "campaign"
)

// QueueItem is one draft in the review pipeline. The JSON contract sent
// to the plugin (plugin/src/lib/types.ts `QueueItem`) uses camelCase and
// does NOT include pageId/pageName as separate fields — handlers will
// join from pages and add `pageName` for display purposes.
type QueueItem struct {
	ID               string          `json:"id"`
	PageID           *string         `json:"pageId,omitempty"`
	PageName         string          `json:"pageName,omitempty"`
	Content          string          `json:"content"`
	ImageURL         *string         `json:"imageUrl,omitempty"`
	MediaURLs        json.RawMessage `json:"mediaUrls"`
	Source           QueueSource     `json:"source"`
	Status           QueueStatus     `json:"status"`
	TrendID          *string         `json:"trendId,omitempty"`
	PromptTemplateID *string         `json:"promptTemplateId,omitempty"`
	CreatedAt        time.Time       `json:"createdAt"`
	UpdatedAt        time.Time       `json:"updatedAt"`
}
