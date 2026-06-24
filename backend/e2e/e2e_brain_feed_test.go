//go:build e2e

package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/handlers"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// memStore is an in-memory BrainFeedStore + BrainDraftStore for e2e tests.
type memStore struct {
	mu         sync.Mutex
	rows       map[string]models.BrainFeedRow // keyed by ID
	drafts     []models.BrainDraftRow
	byCrawledID map[string]string // crawledPostID -> ID
}

func newMemStore() *memStore {
	return &memStore{
		rows:        map[string]models.BrainFeedRow{},
		byCrawledID: map[string]string{},
	}
}

func (m *memStore) Upsert(ctx context.Context, row models.BrainFeedRow) (models.BrainFeedRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if existingID, ok := m.byCrawledID[row.CrawledPostID]; ok {
		return m.rows[existingID], nil
	}
	row.ID = uuid.NewString()
	m.rows[row.ID] = row
	m.byCrawledID[row.CrawledPostID] = row.ID
	return row, nil
}

func (m *memStore) UpdateBrainID(ctx context.Context, id string, brainID string, status string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := m.rows[id]
	r.BrainContentID = brainID
	r.Status = status
	m.rows[id] = r
	return nil
}

func (m *memStore) UpdateStatus(ctx context.Context, id string, status string, errMsg string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := m.rows[id]
	r.Status = status
	m.rows[id] = r
	return nil
}

func (m *memStore) GetByID(ctx context.Context, id string) (models.BrainFeedRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.rows[id]
	if !ok {
		return models.BrainFeedRow{}, os.ErrNotExist
	}
	return r, nil
}

func (m *memStore) Count(ctx context.Context, f repo.BrainFeedFilter) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return int64(len(m.rows)), nil
}

func (m *memStore) List(ctx context.Context, f repo.BrainFeedFilter, page, pageSize int) ([]models.BrainFeedRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]models.BrainFeedRow, 0, len(m.rows))
	for _, r := range m.rows {
		out = append(out, r)
	}
	return out, nil
}

func (m *memStore) Delete(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rows, id)
	for k, v := range m.byCrawledID {
		if v == id {
			delete(m.byCrawledID, k)
		}
	}
	return nil
}

func (m *memStore) Insert(ctx context.Context, arg models.BrainDraftRow) (models.BrainDraftRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if arg.ID == "" {
		arg.ID = uuid.NewString()
	}
	m.drafts = append(m.drafts, arg)
	return arg, nil
}

func (m *memStore) MarkPushed(ctx context.Context, id string, kanbanJobID string) error { return nil }

// Compile-time assertions
var (
	_ service.BrainFeedStore  = (*memStore)(nil)
	_ service.BrainDraftStore = (*memStore)(nil)
	_                         = pgtype.UUID{}
)

func TestE2E_BrainFeed_IngestListGenerate(t *testing.T) {
	if testing.Short() {
		t.Skip("e2e")
	}
	bin := os.Getenv("STUB_BRAIN_BIN")
	if bin == "" {
		t.Skip("STUB_BRAIN_BIN not set; skipping e2e")
	}
	bc := mcp.NewBrainClient(bin, 5*time.Second)
	defer bc.Close()

	store := newMemStore()
	svc := service.NewBrainFeedService(store, store, bc, 5)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	v1 := r.Group("/api/v1/facebook")
	brainH := handlers.NewBrainFeedHandler(svc, svc, svc)
	v1.GET("/brain/feed", brainH.List)
	v1.DELETE("/brain/feed/:id", brainH.Delete)
	v1.POST("/brain/ingest", brainH.Ingest)
	v1.POST("/brain/generate", brainH.Generate)
	srv := httptest.NewServer(r)
	defer srv.Close()

	// Step 1: ingest 3 posts
	ingestBody := map[string]any{
		"posts": []map[string]any{
			{"sourceURL": "u1", "pageID": "p1", "content": "hello", "permalink": "p1", "postedAt": time.Now(), "mediaURLs": []string{}, "videoURLs": []string{}, "mediaType": "text", "likes": 0, "comments": 0, "shares": 0},
			{"sourceURL": "u2", "pageID": "p1", "content": "world", "permalink": "p2", "postedAt": time.Now(), "mediaURLs": []string{}, "videoURLs": []string{}, "mediaType": "text", "likes": 0, "comments": 0, "shares": 0},
			{"sourceURL": "u3", "pageID": "p2", "content": "tech", "permalink": "p3", "postedAt": time.Now(), "mediaURLs": []string{}, "videoURLs": []string{}, "mediaType": "text", "likes": 0, "comments": 0, "shares": 0},
		},
	}
	resp := postJSON(t, srv.URL+"/api/v1/facebook/brain/ingest", ingestBody)
	if resp.StatusCode != 200 {
		t.Fatalf("ingest status %d body=%s", resp.StatusCode, readBody(resp))
	}
	var ingestRes struct {
		Ingested int `json:"ingested"`
		Skipped  int `json:"skipped"`
		Failed   int `json:"failed"`
	}
	decodeJSON(t, resp, &ingestRes)
	if ingestRes.Ingested != 3 {
		t.Fatalf("want 3 ingested, got %+v", ingestRes)
	}

	// Step 2: list
	resp = getJSON(t, srv.URL+"/api/v1/facebook/brain/feed?page=1&page_size=20")
	if resp.StatusCode != 200 {
		t.Fatalf("list status %d body=%s", resp.StatusCode, readBody(resp))
	}
	var listRes struct {
		Items []models.BrainFeedRow `json:"items"`
		Total int64                 `json:"total"`
	}
	decodeJSON(t, resp, &listRes)
	if listRes.Total != 3 || len(listRes.Items) != 3 {
		t.Fatalf("want 3 items, got total=%d len=%d", listRes.Total, len(listRes.Items))
	}

	// Step 3: generate from first feed
	feedID := listRes.Items[0].ID
	genBody := map[string]any{
		"feedIds":   []string{feedID},
		"personaId": "tech-persona",
	}
	resp = postJSON(t, srv.URL+"/api/v1/facebook/brain/generate", genBody)
	if resp.StatusCode != 200 {
		t.Fatalf("generate status %d body=%s", resp.StatusCode, readBody(resp))
	}
	var genRes struct {
		Drafts []models.BrainDraftRow `json:"drafts"`
	}
	decodeJSON(t, resp, &genRes)
	if len(genRes.Drafts) != 1 {
		t.Fatalf("want 1 draft, got %d", len(genRes.Drafts))
	}

	// Step 4: delete
	req, _ := http.NewRequest("DELETE", srv.URL+"/api/v1/facebook/brain/feed/"+feedID, nil)
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp2.StatusCode != 200 {
		t.Fatalf("delete status %d", resp2.StatusCode)
	}
	resp2.Body.Close()

	// Step 5: list again — should have 2
	resp = getJSON(t, srv.URL+"/api/v1/facebook/brain/feed?page=1&page_size=20")
	if resp.StatusCode != 200 {
		t.Fatalf("list2 status %d", resp.StatusCode)
	}
	decodeJSON(t, resp, &listRes)
	if listRes.Total != 2 {
		t.Fatalf("want 2 after delete, got %d", listRes.Total)
	}
}

// helpers
func postJSON(t *testing.T, url string, body any) *http.Response {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func getJSON(t *testing.T, url string) *http.Response {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func decodeJSON(t *testing.T, resp *http.Response, into any) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(into); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

func readBody(resp *http.Response) string {
	defer resp.Body.Close()
	b := make([]byte, 0, 1024)
	buf := bytes.NewBuffer(b)
	_, _ = buf.ReadFrom(resp.Body)
	return buf.String()
}
