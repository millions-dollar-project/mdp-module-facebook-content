package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"github.com/google/uuid"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

const defaultMaxIngestConcurrency = 5

// BrainClient is the surface of mcp.BrainClient we depend on. Defined here
// so tests can inject fakes.
type BrainClient interface {
	IngestContent(ctx context.Context, p mcp.IngestParams) (string, error)
	PrepareContentInput(ctx context.Context, in mcp.PrepareInput) (*mcp.PrepareResult, error)
	QueryGraph(ctx context.Context, scope map[string]string, entityTypes []string, limit int) (*mcp.QueryGraphResult, error)
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
	kit        KitLoader
	log        *slog.Logger
	maxConc    int
}

func NewBrainFeedService(store BrainFeedStore, drafts BrainDraftStore, bc BrainClient, kit KitLoader, maxConc int) *BrainFeedService {
	if maxConc <= 0 {
		maxConc = defaultMaxIngestConcurrency
	}
	return &BrainFeedService{store: store, draftStore: drafts, bc: bc, kit: kit, log: slog.Default(), maxConc: maxConc}
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
				ThumbnailURLs: p.ThumbnailURLs,
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
			brainID, err := s.bc.IngestContent(ctx, mcp.IngestParams{
				Content:  p.Content,
				Source:   "facebook_crawl",
				SourceID: p.SourceURL,
				Kind:     "post",
				UserID:   "default",
				AccountID: p.AccountUUID,
				Metadata: map[string]any{
					"likes":    p.Likes,
					"comments": p.Comments,
					"shares":   p.Shares,
					"postedAt": p.PostedAt,
					"pageId":   p.PageID,
					"pageName": p.PageName,
					"platform": "facebook",
					"mediaUrls": func() []string {
						out := append([]string{}, p.MediaURLs...)
						return append(out, p.VideoURLs...)
					}(),
				},
			})
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

// List returns paginated rows + total count. When accountID is non-empty
// (the SHA-1 v5 UUID of a kit-account name) the SQL filter pins page_id
// to the matching kit-account name. The earlier "intersect with mdp-brain
// graph_entities" approach produced spurious zero rows in practice
// because brain_feeds.brain_content_id is one-shot — re-runs hand out
// fresh graph IDs while old brain_feeds rows keep their previous
// brain_content_id, so the in-memory intersection dropped legitimate
// rows. The page_id name is set at ingest time and is stable, so it is
// the authoritative per-account filter.
//
// accountID may be either:
//   - a SHA-1 v5 UUID (the UI's wire format) → resolved to a kit-account
//     name via KitLoader and used as page_id.
//   - a raw kit-account name → used as page_id verbatim (handy for
//     debug / dev tools that pass the name directly).
//   - empty → no account scoping.
//
// An unknown UUID returns an empty page rather than the global feed;
// leaking unscoped rows for a UUID the caller asked about would be
// confusing in the UI.
func (s *BrainFeedService) List(ctx context.Context, f repo.BrainFeedFilter, accountID string, page, pageSize int) ([]models.BrainFeedRow, int64, error) {
	if accountID != "" {
		name, ok, unknownUUID := s.resolveAccountName(ctx, accountID)
		if unknownUUID {
			// Well-formed UUID that doesn't map to any kit account:
			// return an empty page so the UI doesn't show a stranger's
			// rows under a phantom account scope.
			return []models.BrainFeedRow{}, 0, nil
		}
		if ok {
			f.SourcePage = &name
		}
		// ok==false && unknownUUID==false: accountID is a raw name
		// (no dashes or otherwise doesn't parse as UUID) — fall through
		// and use it as the page filter verbatim.
		if !ok {
			raw := accountID
			f.SourcePage = &raw
		}
	}
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

// resolveAccountName maps a UI-supplied account_id back to a kit-account
// name. The third return value, unknownUUID, distinguishes a
// well-formed UUID that didn't match any kit account (caller should
// return an empty page) from a non-UUID raw name (caller should use
// the input as the page filter verbatim).
func (s *BrainFeedService) resolveAccountName(ctx context.Context, accountID string) (string, bool, bool) {
	if strings.Count(accountID, "-") == 4 {
		id, err := uuid.Parse(accountID)
		if err == nil {
			// Looks like a UUID. Consult the kit loader.
			if s.kit == nil {
				// No kit loader configured: can't resolve a UUID at
				// all, so the caller asked for a scope we can't honor.
				return "", false, true
			}
			snap, err := s.kit.LookupByUUID(ctx, id)
			if err != nil {
				return "", false, true
			}
			return snap.Name, true, false
		}
		// Four dashes but didn't parse — treat as raw name.
		return accountID, false, false
	}
	// Not a UUID-shaped input — caller passed a raw name.
	return accountID, false, false
}

// Delete removes a feed by ID.
func (s *BrainFeedService) Delete(ctx context.Context, id string) error {
	return s.store.Delete(ctx, id)
}

// ListNewest returns the `limit` most-recently-created brain_feeds
// rows scoped to the given account. Used by the
// `/brain/generate-and-schedule` batch endpoint as style context
// for the AI generator. The account scoping follows the same
// UUID-vs-raw-name rules as List; a UUID that doesn't resolve to a
// kit account returns an empty slice (same "phantom scope" guard).
//
// Limit is clamped to [1, 50] to keep the AI input bounded.
func (s *BrainFeedService) ListNewest(ctx context.Context, accountID string, limit int) ([]models.BrainFeedRow, error) {
	if limit <= 0 {
		limit = 1
	}
	if limit > 50 {
		limit = 50
	}
	rows, _, err := s.List(ctx, repo.BrainFeedFilter{}, accountID, 1, limit)
	return rows, err
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
				// personaID is the AI model/persona the user picked in
				// the SchedulePostModal. The Kanban tab renders it as a
				// chip so the user can see which model produced each
				// post at a glance.
				PersonaID: personaID,
				Status:    status,
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
