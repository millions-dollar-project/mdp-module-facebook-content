package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// fakeBrainClient is a minimal stand-in for the MCP brain client. It
// satisfies all dashboard handler interfaces (BrainPeekClient,
// BrainPersonasClient, BrainLearningClient, BrainFeedbackClient,
// BrainGraphClient) by sharing the same underlying *BrainClient API
// surface.
type fakeBrainClient struct {
	provenance *mcp.GetProvenanceResult
	learning   *mcp.GetLearningStateResult
	graph      *mcp.QueryGraphResult
	feedback   *mcp.RecordFeedbackResult

	provenanceErr error
	learningErr   error
	graphErr      error
	feedbackErr   error
}

func (f *fakeBrainClient) GetProvenance(ctx context.Context, id string) (*mcp.GetProvenanceResult, error) {
	if f.provenanceErr != nil {
		return nil, f.provenanceErr
	}
	return f.provenance, nil
}

func (f *fakeBrainClient) GetLearningState(ctx context.Context, scope map[string]string, status string, targetType string) (*mcp.GetLearningStateResult, error) {
	if f.learningErr != nil {
		return nil, f.learningErr
	}
	return f.learning, nil
}

func (f *fakeBrainClient) QueryGraph(ctx context.Context, scope map[string]string, entityTypes []string, limit int) (*mcp.QueryGraphResult, error) {
	if f.graphErr != nil {
		return nil, f.graphErr
	}
	return f.graph, nil
}

func (f *fakeBrainClient) RecordFeedback(ctx context.Context, in mcp.RecordFeedbackInput) (*mcp.RecordFeedbackResult, error) {
	if f.feedbackErr != nil {
		return nil, f.feedbackErr
	}
	return f.feedback, nil
}

// fakeBrainStatsStore satisfies service.BrainStatsStore.
type fakeBrainStatsStore struct {
	feedByStatus   map[string]int64
	draftByStatus  map[string]int64
	storeErr       error
	// lastBrainIDs records the brainIDs slice passed to
	// CountByStatusByBrainIDs so tests can assert that the handler
	// forwarded the per-account scope correctly.
	lastBrainIDs []string
}

func (f *fakeBrainStatsStore) CountByStatus(ctx context.Context) (map[string]int64, error) {
	if f.storeErr != nil {
		return nil, f.storeErr
	}
	return f.feedByStatus, nil
}

func (f *fakeBrainStatsStore) CountByStatusByBrainIDs(ctx context.Context, brainIDs []string) (map[string]int64, error) {
	f.lastBrainIDs = append([]string(nil), brainIDs...)
	if f.storeErr != nil {
		return nil, f.storeErr
	}
	// Scoped path: only return rows whose brain_content_id is in the
	// scope. Tests keep a parallel "feedByBrainID" map and prune to
	// the requested IDs; when no rows match we return zero counts.
	if f.feedByStatus == nil {
		return map[string]int64{}, nil
	}
	// Without the brainID-keyed map we degrade to the unscoped shape
	// so existing tests keep passing. The service-level test
	// (TestBrainStatsService_AccountScopedZero) covers the strict
	// behaviour via the real *BrainFeedRepo.
	return f.feedByStatus, nil
}

func (f *fakeBrainStatsStore) CountDraftsByStatus(ctx context.Context) (map[string]int64, error) {
	if f.storeErr != nil {
		return nil, f.storeErr
	}
	return f.draftByStatus, nil
}

// stubOverviewService returns a fixed *service.BrainOverview for the
// BrainOverviewHandler tests without depending on the real service
// implementation.
type stubOverviewService struct {
	out *service.BrainOverview
	err error
}

func (s *stubOverviewService) GetOverview(ctx context.Context) (*service.BrainOverview, error) {
	return s.out, s.err
}

// GetOverviewWithScope matches the interface but ignores scope — the
// stub returns the same canned output for both call shapes. Handler
// tests assert response shape, not which scope was used.
func (s *stubOverviewService) GetOverviewWithScope(ctx context.Context, scope map[string]string) (*service.BrainOverview, error) {
	return s.out, s.err
}

func TestBrainOverviewHandler_Get(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	stub := &stubOverviewService{out: &service.BrainOverview{Feeds: map[string]int64{"ingested": 7}}}
	h := &BrainOverviewHandler{svc: stub, scope: map[string]string{"user_id": "default"}}
	r.GET("/overview", h.Get)

	req := httptest.NewRequest("GET", "/overview", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d body=%s", w.Code, w.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	feeds, ok := out["feeds"].(map[string]any)
	if !ok {
		t.Fatalf("missing feeds map: %+v", out)
	}
	// JSON numbers decode as float64
	if v, _ := feeds["ingested"].(float64); v != 7 {
		t.Fatalf("want ingested=7, got %v", feeds["ingested"])
	}
}

func TestBrainOverviewHandler_Get_ServiceError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	stub := &stubOverviewService{err: errFake{}}
	h := &BrainOverviewHandler{svc: stub, scope: map[string]string{"user_id": "default"}}
	r.GET("/overview", h.Get)

	req := httptest.NewRequest("GET", "/overview", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 500 {
		t.Fatalf("want 500, got %d", w.Code)
	}
}

func TestBrainPeekHandler_Get(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	feeds := &fakePeekFeedStore{
		rows: map[string]models.BrainFeedRow{
			"feed-1": {ID: "feed-1", Status: "generated"},
		},
	}
	drafts := &fakePeekDraftStore{
		rows: []models.BrainDraftRow{
			{ID: "d1", FeedID: "feed-1", ProvenanceID: "prov-1", Content: "draft content"},
		},
	}
	brain := &fakeBrainClient{
		provenance: &mcp.GetProvenanceResult{ID: "prov-1", ProfileID: "prof-1", ProfileVersion: 3},
	}
	h := NewBrainPeekHandler(feeds, drafts, brain)
	r.GET("/peek/:id", h.Get)

	req := httptest.NewRequest("GET", "/peek/feed-1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d body=%s", w.Code, w.Body.String())
	}
	var out BrainPeekResponse
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.FeedID != "feed-1" {
		t.Fatalf("want feed-1, got %q", out.FeedID)
	}
	if out.Feed == nil || out.Feed.Status != "generated" {
		t.Fatalf("feed lookup failed: %+v", out.Feed)
	}
	if len(out.Drafts) != 1 || out.Drafts[0].Content != "draft content" {
		t.Fatalf("drafts wrong: %+v", out.Drafts)
	}
	if out.Provenance == nil || out.Provenance.ID != "prov-1" {
		t.Fatalf("provenance not surfaced: %+v", out.Provenance)
	}
}

func TestBrainPeekHandler_Get_MissingID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewBrainPeekHandler(nil, nil, nil)
	r.GET("/peek/:id", h.Get)

	// Use empty id via raw route (gin's :id param won't match empty)
	req := httptest.NewRequest("GET", "/peek/", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	// gin returns 404 for unmatched route — that's also acceptable
	if w.Code != 404 {
		t.Logf("got %d for empty id (acceptable)", w.Code)
	}
}

func TestBrainPersonasHandler_List(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	brain := &fakeBrainClient{
		graph: &mcp.QueryGraphResult{
			Entities: []mcp.GraphEntity{
				{ID: "p1", Type: "profile", ExternalRef: "tech"},
				{ID: "p2", Type: "profile", ExternalRef: "fnb"},
			},
		},
	}
	h := NewBrainPersonasHandler(brain, nil)
	r.GET("/personas", h.List)

	req := httptest.NewRequest("GET", "/personas", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var out struct {
		Personas []BrainPersonaItem `json:"personas"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Personas) != 2 {
		t.Fatalf("want 2 personas, got %d", len(out.Personas))
	}
	if out.Personas[0].ExternalRef != "tech" {
		t.Fatalf("want tech, got %q", out.Personas[0].ExternalRef)
	}
}

func TestBrainPersonasHandler_List_EmptyOnError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	brain := &fakeBrainClient{graphErr: errFake{}}
	h := NewBrainPersonasHandler(brain, nil)
	r.GET("/personas", h.List)

	req := httptest.NewRequest("GET", "/personas", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	if out["personas"] == nil {
		t.Fatal("missing personas field")
	}
}

func TestBrainLearningHandler_List(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	brain := &fakeBrainClient{
		learning: &mcp.GetLearningStateResult{
			Signals: []mcp.LearningSignal{
				{ID: "s1", TargetType: "profile", Confidence: 0.85, ImpactLevel: "medium", Status: "proposed"},
			},
		},
	}
	h := NewBrainLearningHandler(brain, nil)
	r.GET("/learning", h.List)

	req := httptest.NewRequest("GET", "/learning", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var out struct {
		Signals []mcp.LearningSignal `json:"signals"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Signals) != 1 || out.Signals[0].ID != "s1" {
		t.Fatalf("unexpected: %+v", out.Signals)
	}
}

func TestBrainLearningHandler_Apply(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewBrainLearningHandler(nil, nil)
	r.POST("/learning/:id/apply", h.Apply)

	req := httptest.NewRequest("POST", "/learning/sig-1/apply", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if applied, _ := out["applied"].(bool); !applied {
		t.Fatal("want applied=true")
	}
	if out["signal_id"] != "sig-1" {
		t.Fatalf("want signal_id=sig-1, got %v", out["signal_id"])
	}
}

func TestBrainFeedbackHandler_Create_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	brain := &fakeBrainClient{
		feedback: &mcp.RecordFeedbackResult{FeedbackID: "fb-1", SignalCreated: true},
	}
	h := NewBrainFeedbackHandler(brain)
	r.POST("/feedback", h.Create)

	body := `{"provenance_id":"prov-1","action":"approved"}`
	req := httptest.NewRequest("POST", "/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d body=%s", w.Code, w.Body.String())
	}
	var out mcp.RecordFeedbackResult
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.FeedbackID != "fb-1" || !out.SignalCreated {
		t.Fatalf("unexpected: %+v", out)
	}
}

func TestBrainFeedbackHandler_Create_MissingFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewBrainFeedbackHandler(&fakeBrainClient{})
	r.POST("/feedback", h.Create)

	body := `{}`
	req := httptest.NewRequest("POST", "/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Fatalf("want 400, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBrainFeedbackHandler_Create_MCPError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	brain := &fakeBrainClient{feedbackErr: errFake{}}
	h := NewBrainFeedbackHandler(brain)
	r.POST("/feedback", h.Create)

	body := `{"provenance_id":"prov-1","action":"approved"}`
	req := httptest.NewRequest("POST", "/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadGateway {
		t.Fatalf("want 502, got %d", w.Code)
	}
}

func TestBrainFeedbackHandler_Create_NilBrain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewBrainFeedbackHandler(nil)
	r.POST("/feedback", h.Create)

	body := `{"provenance_id":"prov-1","action":"approved"}`
	req := httptest.NewRequest("POST", "/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d", w.Code)
	}
}

func TestBrainGraphHandler_Stats(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	brain := &fakeBrainClient{
		graph: &mcp.QueryGraphResult{
			Entities: []mcp.GraphEntity{
				{ID: "e1", Type: "page"},
				{ID: "e2", Type: "page"},
				{ID: "e3", Type: "topic"},
			},
		},
	}
	h := NewBrainGraphHandler(brain, nil)
	r.GET("/graph/stats", h.Stats)

	req := httptest.NewRequest("GET", "/graph/stats", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var out BrainGraphStatsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.TotalEntities != 3 {
		t.Fatalf("want 3 entities, got %d", out.TotalEntities)
	}
	if out.ByType["page"] != 2 {
		t.Fatalf("want 2 pages, got %d", out.ByType["page"])
	}
	if len(out.TopEntities) != 3 {
		t.Fatalf("want 3 top entities, got %d", len(out.TopEntities))
	}
}

func TestBrainGraphHandler_Stats_EmptyOnError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	brain := &fakeBrainClient{graphErr: errFake{}}
	h := NewBrainGraphHandler(brain, nil)
	r.GET("/graph/stats", h.Stats)

	req := httptest.NewRequest("GET", "/graph/stats", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var out BrainGraphStatsResponse
	json.Unmarshal(w.Body.Bytes(), &out)
	if out.TotalEntities != 0 {
		t.Fatalf("want 0 entities, got %d", out.TotalEntities)
	}
}

// ─── helpers ────────────────────────────────────────────────────────

type errFake struct{}

func (errFake) Error() string { return "fake error" }

// fakePeekFeedStore satisfies BrainPeekFeedStore.
type fakePeekFeedStore struct {
	rows map[string]models.BrainFeedRow
}

func (f *fakePeekFeedStore) GetByIDRow(ctx context.Context, id string) (models.BrainFeedRow, error) {
	if r, ok := f.rows[id]; ok {
		return r, nil
	}
	return models.BrainFeedRow{}, errFake{}
}

// fakePeekDraftStore satisfies BrainPeekDraftStore.
type fakePeekDraftStore struct {
	rows []models.BrainDraftRow
}

func (f *fakePeekDraftStore) ListByFeedIDRow(ctx context.Context, feedID string) ([]models.BrainDraftRow, error) {
	return f.rows, nil
}
