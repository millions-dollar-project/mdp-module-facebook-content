package service

import (
	"context"
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

type BrainFeedService struct {
	store   BrainFeedStore
	bc      BrainClient
	log     *slog.Logger
	maxConc int
}

func NewBrainFeedService(store BrainFeedStore, log *slog.Logger, bc BrainClient, maxConc int) *BrainFeedService {
	if maxConc <= 0 {
		maxConc = defaultMaxIngestConcurrency
	}
	if log == nil {
		log = slog.Default()
	}
	return &BrainFeedService{store: store, bc: bc, log: log, maxConc: maxConc}
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
