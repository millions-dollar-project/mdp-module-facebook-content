package service

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

const defaultMaxIngestConcurrency = 5

// BrainClient is the surface of mcp.BrainClient we depend on. Defined here
// so tests can inject fakes.
type BrainClient interface {
	IngestContent(ctx context.Context, content string) (string, error)
	PrepareContentInput(ctx context.Context, in mcp.PrepareInput) (*mcp.PrepareResult, error)
}

// BrainFeedStore is the repo surface the service depends on. The concrete
// repo.BrainFeedRepo must implement these methods (currently it does, but
// with sqlc types — we'll add adapters in T7 router wiring).
//
// For now the service operates on domain models. A thin adapter in router
// wiring will convert sqlc types <-> models.
type BrainFeedStore interface {
	Upsert(ctx context.Context, row models.BrainFeedRow) (models.BrainFeedRow, error)
	UpdateBrainID(ctx context.Context, id string, brainID string, status string) error
	UpdateStatus(ctx context.Context, id string, status string, errMsg string) error
	GetByID(ctx context.Context, id string) (models.BrainFeedRow, error)
	List(ctx context.Context, f repo.BrainFeedFilter, page, pageSize int) ([]models.BrainFeedRow, error)
	Count(ctx context.Context, f repo.BrainFeedFilter) (int64, error)
	Delete(ctx context.Context, id string) error
}

// BrainDraftStore is the draft repo surface.
type BrainDraftStore interface {
	Insert(ctx context.Context, arg models.BrainDraftRow) (models.BrainDraftRow, error)
	MarkPushed(ctx context.Context, id string, kanbanJobID string) error
}

// BrainFeedService now also holds drafts store.
type BrainFeedService struct {
	store      BrainFeedStore
	draftStore BrainDraftStore
	bc         BrainClient
	log        *slog.Logger
	maxConc    int
}

func NewBrainFeedService(store BrainFeedStore, drafts BrainDraftStore, bc BrainClient, maxConc int) *BrainFeedService {
	if maxConc <= 0 {
		maxConc = defaultMaxIngestConcurrency
	}
	return &BrainFeedService{store: store, draftStore: drafts, bc: bc, log: slog.Default(), maxConc: maxConc}
}

// Ingest persists posts to brain_feeds and concurrently calls mcp-brain to
// ingest content. Returns summary counts. Always-on per spec D7.
func (s *BrainFeedService) Ingest(ctx context.Context, posts []models.CrawledPostInput) (models.IngestResult, error) {
	var (
		wg     sync.WaitGroup
		mu     sync.Mutex
		result models.IngestResult
		sem    = make(chan struct{}, s.maxConc)
	)
	for _, p := range posts {
		wg.Add(1)
		sem <- struct{}{}
		go func(p models.CrawledPostInput) {
			defer wg.Done()
			defer func() { <-sem }()
			row, err := s.store.Upsert(ctx, models.BrainFeedRow{
				CrawledPostID: p.SourceURL,
				PageID:        p.PageID,
				PageName:      p.PageName,
				Content:       p.Content,
				MediaURLs:     p.MediaURLs,
				VideoURLs:     p.VideoURLs,
				ThumbnailURLs: p.Thumbnails,
				FullPicture:   p.FullPicture,
				MediaType:     p.MediaType,
				Likes:         p.Likes,
				Comments:      p.Comments,
				Shares:        p.Shares,
				PostedAt:      p.PostedAt,
				SourceURL:     p.SourceURL,
				Permalink:     p.Permalink,
				Status:        "ingested",
			})
			if err != nil {
				s.log.Warn("brain ingest upsert failed", "sourceURL", p.SourceURL, "err", err)
				mu.Lock()
				result.Failed++
				mu.Unlock()
				return
			}
			brainID, err := s.bc.IngestContent(ctx, p.Content)
			if err != nil {
				s.log.Warn("brain ingest mcp failed", "sourceURL", p.SourceURL, "err", err)
				_ = s.store.UpdateStatus(ctx, row.ID, "failed", err.Error())
				mu.Lock()
				result.Failed++
				mu.Unlock()
				return
			}
			if brainID == "" {
				_ = s.store.UpdateStatus(ctx, row.ID, "ingested_no_brain_id", "")
				mu.Lock()
				result.Ingested++
				mu.Unlock()
				return
			}
			if err := s.store.UpdateBrainID(ctx, row.ID, brainID, "ingested"); err != nil {
				s.log.Warn("brain ingest update_brain_id failed", "id", row.ID, "err", err)
			}
			mu.Lock()
			result.Ingested++
			mu.Unlock()
		}(p)
	}
	wg.Wait()
	return result, nil
}

// List returns paginated rows + total count.
func (s *BrainFeedService) List(ctx context.Context, f repo.BrainFeedFilter, page, pageSize int) ([]models.BrainFeedRow, int64, error) {
	total, err := s.store.Count(ctx, f)
	if err != nil {
		return nil, 0, err
	}
	rows, err := s.store.List(ctx, f, page, pageSize)
	if err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// Delete removes a feed by ID.
func (s *BrainFeedService) Delete(ctx context.Context, id string) error {
	return s.store.Delete(ctx, id)
}

// Generate fetches each feed, calls mcp-brain's PrepareContentInput, persists
// a brain_draft row, and updates the feed's status. Returns per-feed drafts
// and failures (partial success).
func (s *BrainFeedService) Generate(ctx context.Context, feedIDs []string, personaID string) ([]models.BrainDraftRow, []models.GenerateFailure, error) {
	if s.draftStore == nil {
		return nil, nil, fmt.Errorf("draft store not configured")
	}
	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		out      []models.BrainDraftRow
		failures []models.GenerateFailure
		sem      = make(chan struct{}, s.maxConc)
	)
	for _, id := range feedIDs {
		wg.Add(1)
		sem <- struct{}{}
		go func(feedID string) {
			defer wg.Done()
			defer func() { <-sem }()
			feed, err := s.store.GetByID(ctx, feedID)
			if err != nil {
				s.log.Warn("generate: feed not found", "feedID", feedID, "err", err)
				mu.Lock()
				failures = append(failures, models.GenerateFailure{FeedID: feedID, Err: err.Error()})
				mu.Unlock()
				return
			}
			res, err := s.bc.PrepareContentInput(ctx, mcp.PrepareInput{
				Scope:          mcp.Scope{ProfileID: personaID, Platform: "facebook"},
				Platform:       "facebook",
				Brief:          feed.Content,
				DraftRequested: true,
			})
			if err != nil {
				s.log.Warn("generate: mcp failed", "feedID", feedID, "err", err)
				_ = s.store.UpdateStatus(ctx, feedID, "failed", err.Error())
				mu.Lock()
				failures = append(failures, models.GenerateFailure{FeedID: feedID, Err: err.Error()})
				mu.Unlock()
				return
			}
			if len(res.DraftVariants) == 0 {
				mu.Lock()
				failures = append(failures, models.GenerateFailure{FeedID: feedID, Err: "no draft returned"})
				mu.Unlock()
				return
			}
			draft := res.DraftVariants[0].Content
			status := "generated"
			if res.Validation.Status == "blocked" {
				status = "blocked"
			}
			inserted, err := s.draftStore.Insert(ctx, models.BrainDraftRow{
				FeedID:           feedID,
				Content:          draft,
				ProvenanceID:     res.ProvenanceID,
				ValidationStatus: res.Validation.Status,
				Warnings:         res.Warnings,
				Status:           status,
			})
			if err != nil {
				mu.Lock()
				failures = append(failures, models.GenerateFailure{FeedID: feedID, Err: err.Error()})
				mu.Unlock()
				return
			}
			// Only update feed status if draft is not blocked
			if status != "blocked" {
				_ = s.store.UpdateStatus(ctx, feedID, "generated", "")
			}
			mu.Lock()
			out = append(out, inserted)
			mu.Unlock()
		}(id)
	}
	wg.Wait()
	return out, failures, nil
}
