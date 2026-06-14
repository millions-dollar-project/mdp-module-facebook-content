package service_test

import (
	"context"
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

// TestPublisher_PublishToFacebook_RecordsInHistory is the
// end-to-end happy path: mock Graph server returns a post id, the
// publisher writes to post_history. We assert the history row exists.
func TestPublisher_PublishToFacebook_RecordsInHistory(t *testing.T) {
	d := testutil.NewPostgres(t)
	pagesRepo := repo.NewPagesRepo(db.New(d.Pool), nil)
	postsRepo := repo.NewPostsRepo(db.New(d.Pool))
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

	mock := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"111_222_333"}`))
	})
	srv := httptest.NewServer(mock)
	t.Cleanup(srv.Close)

	graph := fb.NewClient(fb.Config{BaseURL: srv.URL, APIVersion: "v18.0"})
	pub := service.NewPublisher(graph, postsRepo, pagesRepo, log)

	page, err := pagesRepo.Create(context.Background(), models.Page{
		PageID:          "9",
		PageName:        "Test",
		PageAccessToken: "tok",
		IsActive:        true,
		PostingEnabled:  true,
	})
	require.NoError(t, err)

	postID, err := pub.PublishContent(context.Background(), page, "hello world")
	require.NoError(t, err)
	assert.Equal(t, "111_222_333", postID)

	// History row should exist
	hist, err := postsRepo.ListHistory(context.Background(), 10)
	require.NoError(t, err)
	require.Len(t, hist, 1)
	assert.Equal(t, "111_222_333", hist[0].PostID)
	assert.Equal(t, "hello world", hist[0].Content)
}

// TestPublisher_RefusesInactivePage: an inactive page should not be
// published even if the token would otherwise work.
func TestPublisher_RefusesInactivePage(t *testing.T) {
	d := testutil.NewPostgres(t)
	pagesRepo := repo.NewPagesRepo(db.New(d.Pool), nil)
	postsRepo := repo.NewPostsRepo(db.New(d.Pool))
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	pub := service.NewPublisher(nil, postsRepo, pagesRepo, log)

	page, err := pagesRepo.Create(context.Background(), models.Page{
		PageID:          "1",
		PageName:        "X",
		PageAccessToken: "t",
		IsActive:        true,
		PostingEnabled:  true,
	})
	require.NoError(t, err)
	page.IsActive = false

	_, err = pub.PublishContent(context.Background(), page, "hello")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "inactive")
}
