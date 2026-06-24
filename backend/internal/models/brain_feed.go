package models

import "time"

// CrawledPostInput is a crawled Facebook post ready for ingestion.
type CrawledPostInput struct {
	SourceURL   string
	PageID      string
	PageName    string
	Content     string
	MediaURLs   []string
	VideoURLs   []string
	Thumbnails  []string
	FullPicture string
	MediaType   string
	Likes       int
	Comments    int
	Shares      int
	PostedAt    time.Time
	Permalink   string
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
