package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/testutil"
)

// newTestServer wires the full router against a testcontainer Postgres.
// Returns the httptest.Server and a handle to the test DB so tests can
// inspect post-state.
func newTestServer(t *testing.T, graphHandler http.HandlerFunc) (*httptest.Server, *testutil.DB) {
	t.Helper()
	d := testutil.NewPostgres(t)
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	gin.SetMode(gin.TestMode)

	var graph *fb.Client
	if graphHandler != nil {
		srv := httptest.NewServer(graphHandler)
		t.Cleanup(srv.Close)
		graph = fb.NewClient(fb.Config{BaseURL: srv.URL, APIVersion: "v18.0"})
	}

	router := api.NewRouter(api.RouterDeps{
		Pool:        d.Pool,
		Pages:       repo.NewPagesRepo(db.New(d.Pool), nil),
		Queue:       repo.NewQueueRepo(db.New(d.Pool)),
		Sched:       repo.NewSchedulerRepo(db.New(d.Pool)),
		Posts:       repo.NewPostsRepo(db.New(d.Pool)),
		Config:      repo.NewConfigRepo(db.New(d.Pool), nil),
		Graph:       graph,
		AppSecret:   "test-app-secret",
		VerifyToken: "test-verify-token",
		Logger:      log,
	})
	apiSrv := httptest.NewServer(router)
	t.Cleanup(apiSrv.Close)
	return apiSrv, d
}

// post is a tiny helper for issuing POST requests with JSON body.
func post(t *testing.T, srv *httptest.Server, path string, body any) (*http.Response, []byte) {
	t.Helper()
	b, err := json.Marshal(body)
	require.NoError(t, err)
	resp, err := http.Post(srv.URL+path, "application/json", bytes.NewReader(b))
	require.NoError(t, err)
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	return resp, raw
}

func TestHealth_Ok(t *testing.T) {
	srv, _ := newTestServer(t, nil)
	resp, err := http.Get(srv.URL + "/health")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, "ok", body["status"])
	assert.Equal(t, "facebook", body["platform"])
	assert.Equal(t, "up", body["db"])
}

func TestMe(t *testing.T) {
	srv, _ := newTestServer(t, nil)
	resp, err := http.Get(srv.URL + "/me")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestConfig_GetThenSave_NoSecretLeak(t *testing.T) {
	srv, _ := newTestServer(t, nil)

	// Save with appSecret set
	resp, _ := post(t, srv, "/api/v1/facebook/config", map[string]any{
		"pageId":            "100",
		"pageAccessToken":   "EAA_TEST",
		"publishMode":       "review",
		"webhookVerifyToken": "tok",
		"appSecret":         "super-secret",
	})
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Get — appSecret must NOT appear in the response
	resp, err := http.Get(srv.URL + "/api/v1/facebook/config")
	require.NoError(t, err)
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	assert.NotContains(t, string(raw), "super-secret", "appSecret must never appear in GET response")
	assert.NotContains(t, string(raw), "appSecret", "appSecret field name must be stripped")

	var got map[string]any
	require.NoError(t, json.Unmarshal(raw, &got))
	assert.Equal(t, "100", got["pageId"])
	assert.Equal(t, "review", got["publishMode"])
}

func TestConfig_RejectsInvalidMode(t *testing.T) {
	srv, _ := newTestServer(t, nil)
	resp, _ := post(t, srv, "/api/v1/facebook/config", map[string]any{
		"publishMode": "weird",
	})
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestPages_AddListUpdateDelete(t *testing.T) {
	srv, _ := newTestServer(t, nil)
	// Add
	resp, body := post(t, srv, "/api/v1/facebook/add-page", map[string]any{
		"pageId":          "100",
		"pageName":        "Ecohome",
		"pageAccessToken": "EAA_X",
	})
	require.Equal(t, http.StatusOK, resp.StatusCode, string(body))
	var added map[string]any
	require.NoError(t, json.Unmarshal(body, &added))
	id, _ := added["id"].(string)
	require.NotEmpty(t, id)

	// List
	resp, err := http.Get(srv.URL + "/api/v1/facebook/pages")
	require.NoError(t, err)
	defer resp.Body.Close()
	var listResp struct {
		Data []map[string]any `json:"data"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&listResp))
	assert.Len(t, listResp.Data, 1)

	// Update
	added["pageName"] = "Ecohome Renamed"
	resp, body = post(t, srv, "/api/v1/facebook/update-page", added)
	require.Equal(t, http.StatusOK, resp.StatusCode, string(body))

	// Delete
	resp, _ = post(t, srv, "/api/v1/facebook/delete-page", map[string]string{"id": id})
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestPages_AddDuplicate_Returns409(t *testing.T) {
	srv, _ := newTestServer(t, nil)
	body := map[string]any{
		"pageId":          "100",
		"pageName":        "Ecohome",
		"pageAccessToken": "EAA_X",
	}
	resp, _ := post(t, srv, "/api/v1/facebook/add-page", body)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp, _ = post(t, srv, "/api/v1/facebook/add-page", body)
	assert.Equal(t, http.StatusConflict, resp.StatusCode)
}

func TestPages_TestConnection_Success(t *testing.T) {
	mock := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"1","name":"X","fan_count":7}`))
	})
	srv, _ := newTestServer(t, mock)

	_, _ = post(t, srv, "/api/v1/facebook/add-page", map[string]any{
		"pageId": "1", "pageName": "X", "pageAccessToken": "t",
	})
	resp, body := post(t, srv, "/api/v1/facebook/test-page-connection", map[string]string{"pageId": "1"})
	require.Equal(t, http.StatusOK, resp.StatusCode, string(body))
	var got map[string]any
	require.NoError(t, json.Unmarshal(body, &got))
	assert.Equal(t, "ok", got["status"])
	assert.Equal(t, "X", got["pageName"])
	assert.Equal(t, float64(7), got["followersCount"])
}

func TestQueue_RegenerateAppendsStub(t *testing.T) {
	srv, d := newTestServer(t, nil)

	// Insert a queue item directly via SQL on the SAME container the
	// router is connected to (newTestServer returns the test DB).
	_, err := d.Pool.Exec(context.Background(),
		`INSERT INTO facebook.content_queue (content, source, status) VALUES ($1, 'manual', 'NEW')`,
		"original content")
	require.NoError(t, err)

	// Fetch the id
	var id string
	row := d.Pool.QueryRow(context.Background(),
		`SELECT id FROM facebook.content_queue WHERE content = 'original content'`)
	require.NoError(t, row.Scan(&id))

	// Hit regenerate-content
	resp, body := post(t, srv, "/api/v1/facebook/regenerate-content", map[string]string{"id": id})
	require.Equal(t, http.StatusOK, resp.StatusCode, string(body))
	var got map[string]any
	require.NoError(t, json.Unmarshal(body, &got))
	assert.Contains(t, got["content"], "[AI-STUB]")
}

func TestScheduler_ScheduleAndCancel(t *testing.T) {
	srv, _ := newTestServer(t, nil)
	// Need a page first
	_, body := post(t, srv, "/api/v1/facebook/add-page", map[string]any{
		"pageId": "1", "pageName": "P", "pageAccessToken": "t",
	})
	var page map[string]any
	require.NoError(t, json.Unmarshal(body, &page))

	resp, body := post(t, srv, "/api/v1/facebook/schedule-post", map[string]any{
		"pageId":      "1",
		"content":     "future post",
		"scheduledAt": "2099-01-01T00:00:00Z",
	})
	require.Equal(t, http.StatusOK, resp.StatusCode, string(body))
	var sched map[string]any
	require.NoError(t, json.Unmarshal(body, &sched))
	id, _ := sched["id"].(string)
	require.NotEmpty(t, id)
	assert.Equal(t, "SCHEDULED", sched["status"])

	resp, body = post(t, srv, "/api/v1/facebook/cancel-schedule", map[string]string{"id": id})
	require.Equal(t, http.StatusOK, resp.StatusCode, string(body))
	var cancelled map[string]any
	require.NoError(t, json.Unmarshal(body, &cancelled))
	assert.Equal(t, "CANCELLED", cancelled["status"])
}

// readAll removed — using io.ReadAll directly.
