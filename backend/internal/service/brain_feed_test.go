package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
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

	// queryResults is a queue: each QueryGraph call pops the head.
	queryResults []*mcp.QueryGraphResult
	// queryCalls records (scope, entityTypes, limit) for each QueryGraph call.
	queryCalls []queryCall
}

func (f *fakeBrainClient) IngestContent(ctx context.Context, p mcp.IngestParams) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ingests = append(f.ingests, p.Content)
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

func (f *fakeBrainClient) QueryGraph(ctx context.Context, scope map[string]string, entityTypes []string, limit int) (*mcp.QueryGraphResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.queryCalls = append(f.queryCalls, queryCall{Scope: scope, EntityTypes: entityTypes, Limit: limit})
	if len(f.queryResults) == 0 {
		return &mcp.QueryGraphResult{Entities: nil}, nil
	}
	r := f.queryResults[0]
	f.queryResults = f.queryResults[1:]
	return r, nil
}

// queryCall is recorded by fakeBrainClient.QueryGraph so tests can
// assert what the service actually sent on the JSON-RPC args map.
type queryCall struct {
	Scope       map[string]string
	EntityTypes []string
	Limit       int
}

// stubFeedRepo implements service.BrainFeedStore using a thread-safe map.
type stubFeedRepo struct {
	mu    sync.Mutex
	rows  map[string]models.BrainFeedRow // keyed by CrawledPostID
	onList func(repo.BrainFeedFilter)    // optional hook called by List, tests use it to capture the filter
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
	if s.onList != nil {
		s.onList(f)
	}
	s.mu.Unlock()
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
	svc := NewBrainFeedService(store, nil, bc, nil, 5)

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
	svc := NewBrainFeedService(store, nil, bc, nil, 5)

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
	svc := NewBrainFeedService(store, nil, bc, nil, 5)

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
	svc := NewBrainFeedService(store, nil, bc, nil, 5)
	store.rows["u1"] = models.BrainFeedRow{ID: "feed-1", CrawledPostID: "u1", Status: "ingested"}

	rows, total, err := svc.List(context.Background(), repo.BrainFeedFilter{}, "", 1, 20)
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

// TestBrainFeedService_List_UUIDScopedSetsPageFilter proves that when
// accountID is a SHA-1 v5 UUID, the service resolves it via KitLoader
// and pins SourcePage to the matching kit-account name. This is the
// path that fixes the "Graph shows data but Feed is empty" bug — the
// old brain-entity-intersect approach was lossy because brain_feeds
// rows carry stale brain_content_ids.
func TestBrainFeedService_List_UUIDScopedSetsPageFilter(t *testing.T) {
	store := newStubRepo()
	bc := &fakeBrainClient{}
	const accName = "acc-001-tai-khoan-1"
	kit := newFakeKitLoader(KitAccountSnapshot{Name: accName, Status: "active"})
	svc := NewBrainFeedService(store, nil, bc, kit, 5)

	accUUID := AccountUUIDFromName(accName).String()
	var captured repo.BrainFeedFilter
	store.onList = func(f repo.BrainFeedFilter) {
		captured = f
	}

	_, _, err := svc.List(context.Background(), repo.BrainFeedFilter{}, accUUID, 1, 20)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if captured.SourcePage == nil {
		t.Fatalf("want SourcePage set to %q, got nil filter", accName)
	}
	if *captured.SourcePage != accName {
		t.Fatalf("want SourcePage=%q, got %q", accName, *captured.SourcePage)
	}
}

// TestBrainFeedService_List_UnknownUUIDReturnsEmpty proves that an
// unknown UUID returns an empty page rather than leaking the global
// feed. The UI sends a UUID the user picked from their account list;
// returning the unscoped feed under a phantom scope would be
// confusing and a privacy regression.
func TestBrainFeedService_List_UnknownUUIDReturnsEmpty(t *testing.T) {
	store := newStubRepo()
	store.rows["u1"] = models.BrainFeedRow{ID: "feed-1", CrawledPostID: "u1", Status: "ingested"}
	bc := &fakeBrainClient{}
	kit := newFakeKitLoader() // empty — no known accounts
	svc := NewBrainFeedService(store, nil, bc, kit, 5)

	rows, total, err := svc.List(context.Background(), repo.BrainFeedFilter{}, "ffffffff-ffff-ffff-ffff-ffffffffffff", 1, 20)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if total != 0 {
		t.Fatalf("want total=0 for unknown UUID, got %d", total)
	}
	if len(rows) != 0 {
		t.Fatalf("want 0 rows for unknown UUID, got %d", len(rows))
	}
}

// TestBrainFeedService_List_RawNamePassedAsPageFilter proves that a
// non-UUID accountID (e.g. the raw kit-account name from a debug
// tool) is used as the page_id filter verbatim.
func TestBrainFeedService_List_RawNamePassedAsPageFilter(t *testing.T) {
	store := newStubRepo()
	bc := &fakeBrainClient{}
	kit := newFakeKitLoader(KitAccountSnapshot{Name: "acc-001-tai-khoan-1", Status: "active"})
	svc := NewBrainFeedService(store, nil, bc, kit, 5)

	var captured repo.BrainFeedFilter
	store.onList = func(f repo.BrainFeedFilter) {
		captured = f
	}

	_, _, err := svc.List(context.Background(), repo.BrainFeedFilter{}, "acc-001-tai-khoan-1", 1, 20)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if captured.SourcePage == nil {
		t.Fatalf("want SourcePage set for raw name, got nil")
	}
	if *captured.SourcePage != "acc-001-tai-khoan-1" {
		t.Fatalf("want SourcePage=acc-001-tai-khoan-1, got %q", *captured.SourcePage)
	}
}
type stubDraftRepo struct {
	mu       sync.Mutex
	inserted []models.BrainDraftRow
}

func (s *stubDraftRepo) Insert(ctx context.Context, arg models.BrainDraftRow) (models.BrainDraftRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if arg.ID == "" {
		arg.ID = "draft-" + arg.FeedID
	}
	s.inserted = append(s.inserted, arg)
	return arg, nil
}

func (s *stubDraftRepo) MarkPushed(ctx context.Context, id string, kanbanJobID string) error {
	return nil
}

var _ BrainDraftStore = (*stubDraftRepo)(nil)

var _ = db.FacebookBrainDraft{}

// fakeKitLoader is a tiny KitLoader for tests that need UUID→name resolution.
type fakeKitLoader struct {
	byName map[string]KitAccountSnapshot // keyed by Name (== LookupAll's view)
	byUUID map[string]KitAccountSnapshot // keyed by UUID.String()
}

func newFakeKitLoader(accounts ...KitAccountSnapshot) *fakeKitLoader {
	fk := &fakeKitLoader{byName: map[string]KitAccountSnapshot{}, byUUID: map[string]KitAccountSnapshot{}}
	for _, a := range accounts {
		fk.byName[a.Name] = a
		fk.byUUID[AccountUUIDFromName(a.Name).String()] = a
	}
	return fk
}

func (f *fakeKitLoader) LookupByUUID(ctx context.Context, id uuid.UUID) (KitAccountSnapshot, error) {
	snap, ok := f.byUUID[id.String()]
	if !ok {
		return KitAccountSnapshot{}, ErrKitAccountNotFound
	}
	return snap, nil
}

func (f *fakeKitLoader) LookupAll(ctx context.Context) ([]KitAccountSnapshot, error) {
	out := make([]KitAccountSnapshot, 0, len(f.byName))
	for _, s := range f.byName {
		out = append(out, s)
	}
	return out, nil
}

func (f *fakeKitLoader) Invalidate() {}

var _ KitLoader = (*fakeKitLoader)(nil)

func TestBrainFeedService_Generate_HappyPath(t *testing.T) {
	store := newStubRepo()
	store.rows["u1"] = models.BrainFeedRow{ID: "feed-1", CrawledPostID: "u1", Content: "c1", PageID: "p1", PostedAt: time.Now(), Status: "ingested"}
	drafts := &stubDraftRepo{}

	bc := &fakeBrainClient{}
	bc.prepareResults = []*mcp.PrepareResult{
		{ProvenanceID: "prov-1", DraftVariants: []mcp.DraftVariant{{Index: 0, Content: "draft 1"}}, Validation: mcp.ValidationResult{Status: "ok"}, GenerationAvailable: true},
	}

	svc := NewBrainFeedService(store, drafts, bc, nil, 5)
	out, failures, err := svc.Generate(context.Background(), []string{"feed-1"}, "persona-tech")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(failures) != 0 {
		t.Fatalf("unexpected failures: %+v", failures)
	}
	if len(out) != 1 {
		t.Fatalf("want 1 draft, got %d", len(out))
	}
	if out[0].Content != "draft 1" {
		t.Fatalf("unexpected content: %q", out[0].Content)
	}
	if out[0].ProvenanceID != "prov-1" {
		t.Fatalf("unexpected provenance: %q", out[0].ProvenanceID)
	}
	if len(drafts.inserted) != 1 {
		t.Fatalf("want 1 inserted, got %d", len(drafts.inserted))
	}
	// feed status should be updated to 'generated'
	if got := store.rows["u1"].Status; got != "generated" {
		t.Fatalf("want feed status=generated, got %q", got)
	}
}

func TestBrainFeedService_Generate_PartialFailure(t *testing.T) {
	store := newStubRepo()
	store.rows["u1"] = models.BrainFeedRow{ID: "feed-1", CrawledPostID: "u1", Content: "c1", PageID: "p1", PostedAt: time.Now(), Status: "ingested"}
	store.rows["u2"] = models.BrainFeedRow{ID: "feed-2", CrawledPostID: "u2", Content: "c2", PageID: "p1", PostedAt: time.Now(), Status: "ingested"}
	drafts := &stubDraftRepo{}

	bc := &fakeBrainClient{}
	bc.prepareResults = []*mcp.PrepareResult{
		{ProvenanceID: "prov-1", DraftVariants: []mcp.DraftVariant{{Index: 0, Content: "draft 1"}}, Validation: mcp.ValidationResult{Status: "ok"}, GenerationAvailable: true},
	}
	// No second result — feed-2 will fail

	svc := NewBrainFeedService(store, drafts, bc, nil, 5)
	out, failures, err := svc.Generate(context.Background(), []string{"feed-1", "feed-2"}, "")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("want 1 draft, got %d", len(out))
	}
	if len(failures) != 1 {
		t.Fatalf("want 1 failure, got %d", len(failures))
	}
	// Concurrent execution drains the result slice in non-deterministic order;
	// verify that exactly one of feed-1/feed-2 succeeded and the other failed.
	successIDs := make(map[string]bool)
	for _, d := range out {
		successIDs[d.FeedID] = true
	}
	failedIDs := make(map[string]bool)
	for _, f := range failures {
		failedIDs[f.FeedID] = true
	}
	if len(successIDs) != 1 || len(failedIDs) != 1 {
		t.Fatalf("want 1 success + 1 failure, got success=%v failure=%v", successIDs, failedIDs)
	}
	if successIDs["feed-1"] == failedIDs["feed-1"] || successIDs["feed-2"] == failedIDs["feed-2"] {
		t.Fatalf("success/failure IDs must be distinct: success=%v failure=%v", successIDs, failedIDs)
	}
}

func TestBrainFeedService_Generate_BlockedValidation(t *testing.T) {
	store := newStubRepo()
	store.rows["u1"] = models.BrainFeedRow{ID: "feed-1", CrawledPostID: "u1", Content: "c1", PageID: "p1", PostedAt: time.Now(), Status: "ingested"}
	drafts := &stubDraftRepo{}

	bc := &fakeBrainClient{}
	bc.prepareResults = []*mcp.PrepareResult{
		{ProvenanceID: "prov-1", DraftVariants: []mcp.DraftVariant{{Index: 0, Content: "draft 1"}}, Validation: mcp.ValidationResult{Status: "blocked"}, GenerationAvailable: false},
	}

	svc := NewBrainFeedService(store, drafts, bc, nil, 5)
	out, _, err := svc.Generate(context.Background(), []string{"feed-1"}, "")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("want 1 draft (even if blocked), got %d", len(out))
	}
	if out[0].Status != "blocked" {
		t.Fatalf("want draft status=blocked, got %q", out[0].Status)
	}
	if out[0].ValidationStatus != "blocked" {
		t.Fatalf("want validation_status=blocked, got %q", out[0].ValidationStatus)
	}
	// feed status should NOT be 'generated' since it's blocked
	if got := store.rows["u1"].Status; got == "generated" {
		t.Fatalf("feed should not be 'generated' when draft blocked, got %q", got)
	}
}

func TestBrainFeedService_Generate_FeedNotFound(t *testing.T) {
	store := newStubRepo()
	drafts := &stubDraftRepo{}
	bc := &fakeBrainClient{}

	svc := NewBrainFeedService(store, drafts, bc, nil, 5)
	_, failures, err := svc.Generate(context.Background(), []string{"nonexistent"}, "")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(failures) != 1 {
		t.Fatalf("want 1 failure, got %d", len(failures))
	}
	if failures[0].FeedID != "nonexistent" {
		t.Fatalf("want failure for nonexistent, got %q", failures[0].FeedID)
	}
}
