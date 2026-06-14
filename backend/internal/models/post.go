package models

import (
	"encoding/json"
	"time"
)

// PostHistoryEntry matches plugin/src/lib/types.ts `PostHistoryEntry`.
// Used by the History tab and (Phase 4) analytics.
type PostHistoryEntry struct {
	ID             string          `json:"id"`
	PostID         string          `json:"postId"`
	PageID         string          `json:"pageId"`
	PageName       string          `json:"pageName,omitempty"`
	Content        string          `json:"content"`
	ImageURL       *string         `json:"imageUrl,omitempty"`
	MediaURLs      json.RawMessage `json:"mediaUrls"`
	PostURL        *string         `json:"postUrl,omitempty"`
	PublishedAt    time.Time       `json:"publishedAt"`
	Likes          int             `json:"likes"`
	Comments       int             `json:"comments"`
	Shares         int             `json:"shares"`
	Reach          *int            `json:"reach,omitempty"`
	EngagementRate *float64        `json:"engagementRate,omitempty"`
	CreatedAt      time.Time       `json:"createdAt"`
}

// PublishResult is the response from the immediate-publish endpoint
// (POST /api/v1/facebook/publish) and the queue's publish-now.
type PublishResult struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}
