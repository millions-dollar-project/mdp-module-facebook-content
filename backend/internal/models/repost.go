// Package models holds domain types for repost campaigns and group posting.
package models

import "time"

// RepostCampaign tracks a crawl -> spin -> schedule -> group-post flow.
type RepostCampaign struct {
	ID                   string     `json:"id"`
	Name                 string     `json:"name"`
	SourcePostURL        string     `json:"sourcePostUrl"`
	SourcePostText       string     `json:"sourcePostText"`
	SourcePostMediaURLs  []string   `json:"sourcePostMediaUrls,omitempty"`
	CaptionStyle         string     `json:"captionStyle"`
	ScheduledAt          time.Time  `json:"scheduledAt"`
	Status               string     `json:"status"`
	CreatedAt            time.Time  `json:"createdAt"`
	StartedAt            *time.Time `json:"startedAt,omitempty"`
	CompletedAt          *time.Time `json:"completedAt,omitempty"`
	LastError            *string    `json:"lastError,omitempty"`
}

// RepostJob is one group-posting task inside a campaign.
type RepostJob struct {
	ID                string     `json:"id"`
	CampaignID        string     `json:"campaignId"`
	AccountID         string     `json:"accountId"`
	GroupID           string     `json:"groupId"`
	Status            string     `json:"status"`
	Attempts          int        `json:"attempts"`
	LastError         *string    `json:"lastError,omitempty"`
	PostURL           *string    `json:"postUrl,omitempty"`
	ScheduledAt       *time.Time `json:"scheduledAt,omitempty"`
	AnonymousPosting  bool       `json:"anonymousPosting"`
	AutoEnabled       bool       `json:"autoEnabled"`
	StartedAt         *time.Time `json:"startedAt,omitempty"`
	CompletedAt       *time.Time `json:"completedAt,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

// PlanItem is one row in the multi-slot schedule form (SCA-style).
// Each PlanItem pairs an (account, group) with a wall-clock time so a
// single source post fans out into N group-posts on the same day.
type PlanItem struct {
	AccountID        string    `json:"accountId"`
	GroupID          string    `json:"groupId"`
	ScheduledAt      time.Time `json:"scheduledAt"`
	AnonymousPosting bool      `json:"anonymousPosting"`
	AutoEnabled      bool      `json:"autoEnabled"`
}

// QueueFilter scopes ListQueue responses.
type QueueFilter struct {
	Status    string // "" = all
	AccountID string // "" = all
	GroupID   string // "" = all
	Limit     int    // 0 = no limit (default 200)
}

// CrawledPost is a post scraped from a source page.
type CrawledPost struct {
	ID          string     `json:"id"`
	PageID      string     `json:"pageId"`
	SourceURL   string     `json:"sourceUrl"`
	FbPostID    *string    `json:"fbPostId,omitempty"`
	Content     *string    `json:"content,omitempty"`
	MediaURLs   []string   `json:"mediaUrls,omitempty"`
	VideoURLs   []string   `json:"videoUrls,omitempty"`
	// ThumbnailURLs is the first 4 mediaUrls — what the FE renders in
	// the preview strip. For reel/video posts the first entry is the
	// FB video thumbnail (scontent fbcdn jpg). Stored so a reload of
	// the crawled-post list still shows thumbnails without having to
	// re-fetch the source page.
	ThumbnailURLs []string  `json:"thumbnailUrls,omitempty"`
	// FullPicture is the canonical cover image (mediaUrls[0] or empty).
	FullPicture  string     `json:"fullPicture,omitempty"`
	MediaType    string     `json:"mediaType"`
	Likes        int        `json:"likes"`
	Comments     int        `json:"comments"`
	Shares       int        `json:"shares"`
	// ReactionIcons is the colored reaction emoji image URLs from the
	// FB reaction toolbar. Stored alongside the post so the FE can
	// re-render the like/love/haha row without re-scraping.
	ReactionIcons []string   `json:"reactionIcons,omitempty"`
	PostedAt      *time.Time `json:"postedAt,omitempty"`
	Permalink    *string    `json:"permalink,omitempty"`
	IsSelected   bool       `json:"isSelected"`
	CreatedAt    time.Time  `json:"createdAt"`
}

// FBAccount is a Facebook user profile for Playwright group posting.
type FBAccount struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Email        *string    `json:"email,omitempty"`
	ProfilePath  string     `json:"profilePath"`
	CookiesJSON  *string    `json:"cookiesJson,omitempty"`
	Status       string     `json:"status"`
	LastUsedAt   *time.Time `json:"lastUsedAt,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
}

// FBGroup is a Facebook group assigned to an account.
type FBGroup struct {
	ID               string     `json:"id"`
	GroupID          string     `json:"groupId"`
	Name             *string    `json:"name,omitempty"`
	AssignedAccountID *string   `json:"assignedAccountId,omitempty"`
	Status           string     `json:"status"`
	LastPostedAt     *time.Time `json:"lastPostedAt,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
}

// CampaignStatus values
const (
	CampaignPending   = "pending"
	CampaignRunning   = "running"
	CampaignCompleted = "completed"
	CampaignFailed    = "failed"
	CampaignExpired   = "expired"
)

// JobStatus values
const (
	JobPending   = "pending"
	JobRunning   = "running"
	JobCompleted = "completed"
	JobFailed    = "failed"
	JobExpired   = "expired"
)
