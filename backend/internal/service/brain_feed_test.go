package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// fakeBrainClient implements BrainClient (defined in service).
type fakeBrainClient struct {
	mu        sync.Mutex
	ingestIDs []string
	ingestErr error
	ingests   []string // record of inputs

	prepareResults []*mcp.PrepareResult
	prepareErr     error
}

func (f *fakeBrainClient) IngestContent(ctx context.Context, content string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ingests = append(f.ingests, content)
	if f.ingestErr != nil {
		return "", f.ingestErr
	}
	if len(f.ingestIDs) == 0 {
		return "", errors.New("no ingest IDs left in fake")
	}
	id, rest := f.ingestIDs[0], f.ingestIDs[1:]
	f.ingestIDs = rest
	return id, nil
}

func (f *fakeBrainClient) PrepareContentInput(ctx context.Context, in mcp.PrepareInput) (*mcp.PrepareResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.prepareErr != nil {
		return nil, f.prepareErr
	}
	if len(f.prepareResults) == 0 {
		return nil, errors.New("no prepare results left in fake")
	}
	r, rest := f.prepareResults[0], f.prepareResults[1:]
	f.prepareResults = rest
	return r, nil
}

// stubFeedRepo implements service.BrainFeedStore using a thread-safe map.
type stubFeedRepo struct {
	mu   sync.Mutex
	rows map[string]models.BrainFeedRow // keyed by CrawledPostID
}

func newStubRepo() *stubFeedRepo {
	return &stubFeedRepo{rows: map[string]models.BrainFeedRow{}}
}

func (s *stubFeedRepo) Upsert(ctx context.Context, row models.BrainFeedRow) (models.BrainFeedRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// idempotent on CrawledPostID
	if existing, ok := s.rows[row.CrawledPostID]; ok {
		return existing, nil
	}
	row.ID = "feed-" + row.CrawledPostID
	s.rows[row.CrawledPostID] = row
	return row, nil
}

func (s *stubFeedRepo) UpdateBrainID(ctx context.Context, id string, brainID string, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, r := range s.rows {
		if r.ID == id {
			r.BrainContentID = brainID
			r.Status = status
			s.rows[k] = r
			return nil
		}
	}
	return errors.New("not found")
}

func (s *stubFeedRepo) UpdateStatus(ctx context.Context, id string, status string, errMsg string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, r := range s.rows {
		if r.ID == id {
			r.Status = status
			s.rows[k] = r
			return nil
		}
	}
	return errors.New("not found")
}

func (s *stubFeedRepo) GetByID(ctx context.Context, id string) (models.BrainFeedRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.rows {
		if r.ID == id {
			return r, nil
		}
	}
	return models.BrainFeedRow{}, errors.New("not found")
}

func (s *stubFeedRepo) Count(ctx context.Context, f repo.BrainFeedFilter) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return int64(len(s.rows)), nil
}

func (s *stubFeedRepo) List(ctx context.Context, f repo.BrainFeedFilter, page, pageSize int) ([]models.BrainFeedRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]models.BrainFeedRow, 0, len(s.rows))
	for _, r := range s.rows {
		out = append(out, r)
	}
	return out, nil
}

func (s *stubFeedRepo) Delete(ctx context.Context, id string) error { return nil }

// Compile-time checks that stubs satisfy the interfaces.
var (
	_ BrainFeedStore = (*stubFeedRepo)(nil)
	_ BrainClient    = (*fakeBrainClient)(nil)
)

// Required for the stubs to also have unused fields compile cleanly.
var _ = db.FacebookBrainFeed{}
var _ = pgtype.UUID{}

func TestBrainFeedService_Ingest_HappyPath(t *testing.T) {
	store := newStubRepo()
	bc := &fakeBrainClient{ingestIDs: []string{"brain-1", "brain-2", "brain-3"}}
	svc := NewBrainFeedService(store, nil, bc, 5)

	posts := []models.CrawledPostInput{
		{SourceURL: "u1", PageID: "p1", Content: "c1", Permalink: "p1", PostedAt: time.Now()},
		{SourceURL: "u2", PageID: "p1", Content: "c2", Permalink: "p2", PostedAt: time.Now()},
		{SourceURL: "u3", PageID: "p1", Content: "c3", Permalink: "p3", PostedAt: time.Now()},
	}
	res, err := svc.Ingest(context.Background(), posts)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if res.Ingested != 3 || res.Skipped != 0 || res.Failed != 0 {
		t.Fatalf("want 3/0/0, got %+v", res)
	}
	if len(bc.ingests) != 3 {
		t.Fatalf("want 3 ingest calls, got %d", len(bc.ingests))
	}
}

func TestBrainFeedService_Ingest_PartialFailure(t *testing.T) {
	store := newStubRepo()
	bc := &fakeBrainClient{ingestIDs: []string{"brain-1"}} // only 1 ID
	svc := NewBrainFeedService(store, nil, bc, 5)

	posts := []models.CrawledPostInput{
		{SourceURL: "u1", PageID: "p1", Content: "c1", Permalink: "p1", PostedAt: time.Now()},
		{SourceURL: "u2", PageID: "p1", Content: "c2", Permalink: "p2", PostedAt: time.Now()},
	}
	res, err := svc.Ingest(context.Background(), posts)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if res.Ingested != 1 || res.Failed != 1 {
		t.Fatalf("want 1/0/1, got %+v", res)
	}
}

func TestBrainFeedService_Ingest_MCPErrorMarksFailed(t *testing.T) {
	store := newStubRepo()
	bc := &fakeBrainClient{ingestErr: errors.New("brain dead")}
	svc := NewBrainFeedService(store, nil, bc, 5)

	posts := []models.CrawledPostInput{
		{SourceURL: "u1", PageID: "p1", Content: "c1", Permalink: "p1", PostedAt: time.Now()},
	}
	res, err := svc.Ingest(context.Background(), posts)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if res.Ingested != 0 || res.Failed != 1 {
		t.Fatalf("want 0/0/1, got %+v", res)
	}
	// Verify status was set to "failed"
	if got := store.rows["u1"].Status; got != "failed" {
		t.Fatalf("want status=failed, got %q", got)
	}
}

func TestBrainFeedService_List_ReturnsRowsAndTotal(t *testing.T) {
	store := newStubRepo()
	bc := &fakeBrainClient{}
	svc := NewBrainFeedService(store, nil, bc, 5)
	store.rows["u1"] = models.BrainFeedRow{ID: "feed-1", CrawledPostID: "u1", Status: "ingested"}

	rows, total, err := svc.List(context.Background(), repo.BrainFeedFilter{}, 1, 20)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if total != 1 {
		t.Fatalf("want total=1, got %d", total)
	}
	if len(rows) != 1 {
		t.Fatalf("want 1 row, got %d", len(rows))
	}
}
