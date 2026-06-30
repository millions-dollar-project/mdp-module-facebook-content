package models

import "time"

// CrawledPostInput is a crawled Facebook post ready for ingestion.
//
// JSON tags are PascalCase to match what the FB-content plugin sends
// (see `plugin/src/lib/types/brain.ts` -> `IngestPostsRequest`). Earlier
// snake_case tags silently mismatched every wire field — SourceURL
// arrived as "" so mcp-brain rejected ingest with `failed=N` while
// rows were inserted with empty `crawled_post_id`. The Brain tab
// showed "10 bài lỗi ingest" and the user thought rows were lost.
// Keep these aligned with `BrainFeedRow` (which serialises PascalCase
// via untagged fields) so requests and responses share one wire
// convention.
type CrawledPostInput struct {
	SourceURL      string    `json:"sourceURL"`
	PageID         string    `json:"pageID"`
	PageName       string    `json:"pageName"`
	Content        string    `json:"content"`
	MediaURLs      []string  `json:"mediaURLs"`
	VideoURLs      []string  `json:"videoURLs"`
	ThumbnailURLs  []string  `json:"thumbnailURLs"`
	FullPicture    string    `json:"fullPicture"`
	MediaType      string    `json:"mediaType"`
	Likes          int       `json:"likes"`
	Comments       int       `json:"comments"`
	Shares         int       `json:"shares"`
	PostedAt       time.Time `json:"postedAt"`
	Permalink      string    `json:"permalink"`
	// AccountUUID is the SHA-1 v5 UUID of the kit-account this post
	// belongs to (mdp.kit.accounts -> name -> AccountUUIDFromName).
	// Empty = "default" (legacy behaviour). When set, the brain feed
	// row and the brain MCP ingest both tag the scope with
	// `account_id = <uuid>` so dashboard panels can filter by kit
	// account.
	AccountUUID string `json:"accountUUID,omitempty"`
}

// BrainFeedRow mirrors facebook.brain_feeds.
type BrainFeedRow struct {
	ID             string
	CrawledPostID  string
	PageID         string
	PageName       string
	Content        string
	MediaURLs      []string
	VideoURLs      []string
	ThumbnailURLs  []string
	FullPicture    string
	MediaType      string
	Likes          int
	Comments       int
	Shares         int
	PostedAt       time.Time
	SourceURL      string
	Permalink      string
	BrainContentID string
	IngestedAt     time.Time
	Status         string
}

// BrainDraftRow mirrors facebook.brain_drafts.
type BrainDraftRow struct {
	ID               string
	FeedID           string
	Content          string
	ProvenanceID     string
	ValidationStatus string
	Warnings         []string
	KanbanJobID      string
	Status           string
}

// IngestResult summarizes a batch ingest.
type IngestResult struct {
	Ingested int
	Skipped  int
	Failed   int
}

// GenerateFailure describes a per-feed generate error.
type GenerateFailure struct {
	FeedID string
	Err    string
}
