package models

import (
	"encoding/json"
	"time"
)

// ScheduleStatus matches the CHECK constraint on facebook.scheduled_posts.status.
type ScheduleStatus string

const (
	ScheduleStatusScheduled  ScheduleStatus = "SCHEDULED"
	ScheduleStatusPublishing ScheduleStatus = "PUBLISHING"
	ScheduleStatusPublished  ScheduleStatus = "PUBLISHED"
	ScheduleStatusFailed     ScheduleStatus = "FAILED"
	ScheduleStatusCancelled  ScheduleStatus = "CANCELLED"
)

// PostType mirrors plugin/src/lib/types.ts `PostType`.
type PostType string

const (
	PostTypeText     PostType = "text"
	PostTypePhoto    PostType = "photo"
	PostTypeVideo    PostType = "video"
	PostTypeLink     PostType = "link"
	PostTypeCarousel PostType = "carousel"
	PostTypeReel     PostType = "reel"
)

// ScheduledPost matches plugin/src/lib/types.ts `ScheduledPost`. The
// `engagement_prediction` column is jsonb; we surface it as a raw JSON
// message so the plugin can decode it into its own shape.
type ScheduledPost struct {
	ID                   string          `json:"id"`
	PageID               string          `json:"pageId"`
	PageName             string          `json:"pageName,omitempty"`
	Content              string          `json:"content"`
	ImageURL             *string         `json:"imageUrl,omitempty"`
	MediaURLs            json.RawMessage `json:"mediaUrls"`
	Status               ScheduleStatus  `json:"status"`
	ScheduledAt          time.Time       `json:"scheduledAt"`
	PostType             PostType        `json:"postType"`
	TrendReference       *string         `json:"trendReference,omitempty"`
	AIGenerated          bool            `json:"aiGenerated"`
	EngagementPrediction json.RawMessage `json:"engagementPrediction,omitempty"`
	CampaignID           *string         `json:"campaignId,omitempty"`
	FacebookPostID       *string         `json:"facebookPostId,omitempty"`
	ErrorMessage         *string         `json:"errorMessage,omitempty"`
	CreatedAt            time.Time       `json:"createdAt"`
	UpdatedAt            time.Time       `json:"updatedAt"`
}
