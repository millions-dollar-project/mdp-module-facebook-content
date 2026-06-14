package service_test

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/testutil"
)

// newTestPages builds a Pages service backed by a real Postgres
// (testcontainer) and a *fb.Client that points at a mock Graph server
// (the http.Handler passed in). If graph returns nil, a real-failing
// fb.Client is used.
func newTestPages(t *testing.T, graphHandler http.Handler) (*service.Pages, *testutil.DB) {
	t.Helper()
	d := testutil.NewPostgres(t)
	pagesRepo := repo.NewPagesRepo(db.New(d.Pool), nil)
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	var g *fb.Client
	if graphHandler != nil {
		srv := httptest.NewServer(graphHandler)
		t.Cleanup(srv.Close)
		g = fb.NewClient(fb.Config{BaseURL: srv.URL, APIVersion: "v18.0", HTTPTimeout: 0})
	}
	return service.NewPages(pagesRepo, g, log), d
}

func TestPages_AddValidation(t *testing.T) {
	pages, _ := newTestPages(t, nil)
	ctx := context.Background()

	// Empty pageId
	_, err := pages.Add(ctx, models.Page{PageName: "X", PageAccessToken: "tok"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "pageId")

	// Empty name -> auto-fallback to pageID
	added, err := pages.Add(ctx, models.Page{PageID: "1", PageAccessToken: "tok"})
	require.NoError(t, err)
	assert.Equal(t, "1", added.PageName)

	// Empty token
	_, err = pages.Add(ctx, models.Page{PageID: "1", PageName: "X"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "pageAccessToken")
}

func TestPages_AddDuplicate(t *testing.T) {
	pages, _ := newTestPages(t, nil)
	ctx := context.Background()

	in := models.Page{PageID: "42", PageName: "Ecohome", PageAccessToken: "tok"}
	_, err := pages.Add(ctx, in)
	require.NoError(t, err)
	_, err = pages.Add(ctx, in)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")
}

func TestPages_AddAndList(t *testing.T) {
	pages, _ := newTestPages(t, nil)
	ctx := context.Background()

	_, err := pages.Add(ctx, models.Page{PageID: "1", PageName: "A", PageAccessToken: "t1"})
	require.NoError(t, err)
	_, err = pages.Add(ctx, models.Page{PageID: "2", PageName: "B", PageAccessToken: "t2"})
	require.NoError(t, err)

	out, err := pages.List(ctx)
	require.NoError(t, err)
	assert.Len(t, out, 2)
}

func TestPages_TestConnection_Success(t *testing.T) {
	mock := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"1","name":"Ecohome","fan_count":1234}`))
	})
	pages, _ := newTestPages(t, mock)
	ctx := context.Background()

	_, err := pages.Add(ctx, models.Page{PageID: "1", PageName: "Ecohome", PageAccessToken: "t"})
	require.NoError(t, err)

	res, err := pages.TestConnection(ctx, "1")
	require.NoError(t, err)
	assert.Equal(t, "ok", res.Status)
	assert.Equal(t, "Ecohome", res.PageName)
	assert.Equal(t, 1234, res.FollowersCount)
}

func TestPages_TestConnection_Unknown(t *testing.T) {
	pages, _ := newTestPages(t, nil)
	res, err := pages.TestConnection(context.Background(), "nope")
	require.NoError(t, err)
	assert.Equal(t, "fail", res.Status)
}

func TestPages_TogglePosting(t *testing.T) {
	pages, _ := newTestPages(t, nil)
	ctx := context.Background()
	added, err := pages.Add(ctx, models.Page{PageID: "1", PageName: "A", PageAccessToken: "t"})
	require.NoError(t, err)
	updated, err := pages.TogglePosting(ctx, added.ID, false)
	require.NoError(t, err)
	assert.False(t, updated.PostingEnabled)
}

func TestPages_NotFoundPaths(t *testing.T) {
	pages, _ := newTestPages(t, nil)
	ctx := context.Background()
	_, err := pages.Update(ctx, models.Page{ID: "00000000-0000-0000-0000-000000000000", PageName: "X"})
	assert.True(t, errors.Is(err, repo.ErrNotFound))
	_, err = pages.TogglePosting(ctx, "00000000-0000-0000-0000-000000000000", true)
	assert.True(t, errors.Is(err, repo.ErrNotFound))
}
