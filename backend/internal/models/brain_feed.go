package models

import "time"

// CrawledPostInput is a crawled Facebook post ready for ingestion.
type CrawledPostInput struct {
	SourceURL   string    `json:"source_url"`
	PageID      string    `json:"page_id"`
	PageName    string    `json:"page_name"`
	Content     string    `json:"content"`
	MediaURLs   []string  `json:"media_urls"`
	VideoURLs   []string  `json:"video_urls"`
	Thumbnails  []string  `json:"thumbnails"`
	FullPicture string    `json:"full_picture"`
	MediaType   string    `json:"media_type"`
	Likes       int       `json:"likes"`
	Comments    int       `json:"comments"`
	Shares      int       `json:"shares"`
	PostedAt    time.Time `json:"posted_at"`
	Permalink   string    `json:"permalink"`
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
