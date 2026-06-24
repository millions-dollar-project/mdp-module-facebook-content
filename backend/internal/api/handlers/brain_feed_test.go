package handlers

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// stubBrainFeedLister implements BrainFeedLister for tests.
type stubBrainFeedLister struct {
	listResp []models.BrainFeedRow
	listTotal int64
}

func (s *stubBrainFeedLister) List(ctx context.Context, _ repo.BrainFeedFilter, _, _ int) ([]models.BrainFeedRow, int64, error) {
	return s.listResp, s.listTotal, nil
}

func (s *stubBrainFeedLister) Delete(ctx context.Context, _ string) error { return nil }

// stubBrainFeedIngestCaller implements BrainFeedIngestCaller for tests.
type stubBrainFeedIngestCaller struct {
	resp models.IngestResult
}

func (s *stubBrainFeedIngestCaller) Ingest(ctx context.Context, posts []models.CrawledPostInput) (models.IngestResult, error) {
	s.resp.Ingested = len(posts)
	return s.resp, nil
}

// stubBrainFeedGenerateCaller implements BrainFeedGenerateCaller for tests.
type stubBrainFeedGenerateCaller struct {
	drafts   []models.BrainDraftRow
	failures []models.GenerateFailure
}

func (s *stubBrainFeedGenerateCaller) Generate(ctx context.Context, feedIDs []string, personaID string) ([]models.BrainDraftRow, []models.GenerateFailure, error) {
	return s.drafts, s.failures, nil
}

func setupRouter(h *BrainFeedHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	v1 := r.Group("/api/v1/facebook")
	v1.GET("/brain/feed", h.List)
	v1.DELETE("/brain/feed/:id", h.Delete)
	v1.POST("/brain/ingest", h.Ingest)
	v1.POST("/brain/generate", h.Generate)
	return r
}

func TestBrainFeedHandler_List_Returns200AndShape(t *testing.T) {
	h := NewBrainFeedHandler(&stubBrainFeedLister{listResp: []models.BrainFeedRow{{ID: "feed-1", Content: "hi"}}, listTotal: 1}, &stubBrainFeedIngestCaller{}, &stubBrainFeedGenerateCaller{})
	r := setupRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/facebook/brain/feed?page=1&page_size=20", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("want 200, got %d body=%s", w.Code, w.Body.String())
	}
	var body struct {
		Items    []models.BrainFeedRow `json:"items"`
		Total    int64                 `json:"total"`
		Page     int                   `json:"page"`
		PageSize int                   `json:"pageSize"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Total != 1 || len(body.Items) != 1 {
		t.Fatalf("unexpected body: %+v", body)
	}
	if body.Page != 1 || body.PageSize != 20 {
		t.Fatalf("unexpected page: %+v", body)
	}
}

func TestBrainFeedHandler_List_FilterParsing(t *testing.T) {
	stub := &stubBrainFeedLister{}
	h := NewBrainFeedHandler(stub, &stubBrainFeedIngestCaller{}, &stubBrainFeedGenerateCaller{})
	r := setupRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/facebook/brain/feed?source_page=p1&status=ingested&search=tech&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z&page=2&page_size=50", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBrainFeedHandler_Delete(t *testing.T) {
	h := NewBrainFeedHandler(&stubBrainFeedLister{}, &stubBrainFeedIngestCaller{}, &stubBrainFeedGenerateCaller{})
	r := setupRouter(h)
	req := httptest.NewRequest("DELETE", "/api/v1/facebook/brain/feed/feed-1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("want 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBrainFeedHandler_Ingest_RequiresPosts(t *testing.T) {
	h := NewBrainFeedHandler(&stubBrainFeedLister{}, &stubBrainFeedIngestCaller{}, &stubBrainFeedGenerateCaller{})
	r := setupRouter(h)
	req := httptest.NewRequest("POST", "/api/v1/facebook/brain/ingest", nil)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Fatalf("want 400, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBrainFeedHandler_Generate_RequiresFeedIDs(t *testing.T) {
	h := NewBrainFeedHandler(&stubBrainFeedLister{}, &stubBrainFeedIngestCaller{}, &stubBrainFeedGenerateCaller{})
	r := setupRouter(h)
	body := `{"feedIds":[]}`
	req := httptest.NewRequest("POST", "/api/v1/facebook/brain/generate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code == 200 {
		t.Fatalf("want 4xx, got 200 body=%s", w.Body.String())
	}
}

func TestBrainFeedHandler_Ingest_ServiceUnavailable(t *testing.T) {
	h := NewBrainFeedHandler(&stubBrainFeedLister{}, nil, &stubBrainFeedGenerateCaller{})
	r := setupRouter(h)
	body := `{"posts":[{"sourceURL":"u1","content":"c","permalink":"p","postedAt":"2026-06-24T00:00:00Z","mediaURLs":[],"videoURLs":[],"mediaType":"text","likes":0,"comments":0,"shares":0}]}`
	req := httptest.NewRequest("POST", "/api/v1/facebook/brain/ingest", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 503 {
		t.Fatalf("want 503 when ingest nil, got %d body=%s", w.Code, w.Body.String())
	}
}
