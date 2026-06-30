package service_test

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/testutil"
)

// TestScheduler_SchedulePersonal_HappyPath covers the entry point of
// the crawl → brain → schedule flow: a kit account UUID resolves to a
// snapshot, and the resulting scheduled_posts row carries the UUID +
// post_type='personal' so the Worker can dispatch it through the
// sidecar.
func TestScheduler_SchedulePersonal_HappyPath(t *testing.T) {
	d := testutil.NewPostgres(t)
	schedRepo := repo.NewSchedulerRepo(db.New(d.Pool))
	pagesRepo := repo.NewPagesRepo(db.New(d.Pool), nil)
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	pub := service.NewPublisher(nil, nil, pagesRepo, log)

	kitUUID := uuid.New()
	fk := newSchedulerFakeKitLoaderWithUUID(kitUUID, "alice", "/tmp/alice-profile")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("sidecar must not be called during SchedulePersonal; got %s %s", r.Method, r.URL.Path)
		http.Error(w, "should not be called", http.StatusTeapot)
	}))
	t.Cleanup(srv.Close)
	sidecar := service.NewSidecarClient(srv.URL)

	schedSvc := service.NewScheduler(schedRepo, pagesRepo, pub, sidecar, fk, log)

	scheduled := time.Now().Add(2 * time.Hour)
	row, err := schedSvc.SchedulePersonal(context.Background(), kitUUID.String(),
		"hello from alice", scheduled, []string{"https://example.com/img1.png"})
	require.NoError(t, err)

	assert.Equal(t, models.PostTypePersonal, row.PostType)
	require.NotNil(t, row.KitAccountID)
	assert.Equal(t, kitUUID.String(), *row.KitAccountID)
	assert.Equal(t, "hello from alice", row.Content)
	assert.True(t, row.AIGenerated)
	assert.Equal(t, models.ScheduleStatusScheduled, row.Status)

	// And re-fetch via repo to confirm DB shape.
	get, err := schedRepo.Get(context.Background(), row.ID)
	require.NoError(t, err)
	assert.Equal(t, models.PostTypePersonal, get.PostType)
	assert.Equal(t, row.ID, get.ID)
}

// TestScheduler_SchedulePersonal_PastTime_Rejected asserts the
// validation that blocks back-dated personal rows — the worker would
// otherwise fire them immediately.
func TestScheduler_SchedulePersonal_PastTime_Rejected(t *testing.T) {
	d := testutil.NewPostgres(t)
	schedRepo := repo.NewSchedulerRepo(db.New(d.Pool))
	pagesRepo := repo.NewPagesRepo(db.New(d.Pool), nil)
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	pub := service.NewPublisher(nil, nil, pagesRepo, log)

	kitUUID := uuid.New()
	fk := newSchedulerFakeKitLoaderWithUUID(kitUUID, "bob", "/tmp/bob-profile")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("sidecar must not be called on validation failure")
	}))
	t.Cleanup(srv.Close)
	sidecar := service.NewSidecarClient(srv.URL)

	schedSvc := service.NewScheduler(schedRepo, pagesRepo, pub, sidecar, fk, log)

	past := time.Now().Add(-10 * time.Minute)
	_, err := schedSvc.SchedulePersonal(context.Background(), kitUUID.String(),
		"too late", past, nil)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "future")
}

// TestScheduler_Reschedule_PostTypeGuard confirms a UI bug or
// cross-handler bug can't reschedule a personal row through the
// fanpage post_type (and vice versa). The SQL WHERE-clause guard
// returns ErrNotFound when the type doesn't match.
func TestScheduler_Reschedule_PostTypeGuard(t *testing.T) {
	d := testutil.NewPostgres(t)
	schedRepo := repo.NewSchedulerRepo(db.New(d.Pool))
	pagesRepo := repo.NewPagesRepo(db.New(d.Pool), nil)
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	pub := service.NewPublisher(nil, nil, pagesRepo, log)

	kitUUID := uuid.New()
	fk := newSchedulerFakeKitLoaderWithUUID(kitUUID, "carol", "/tmp/carol-profile")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	t.Cleanup(srv.Close)
	sidecar := service.NewSidecarClient(srv.URL)

	schedSvc := service.NewScheduler(schedRepo, pagesRepo, pub, sidecar, fk, log)

	row, err := schedSvc.SchedulePersonal(context.Background(), kitUUID.String(),
		"hi", time.Now().Add(1*time.Hour), nil)
	require.NoError(t, err)

	// Wrong post type → ErrNotFound (no row updated).
	_, err = schedSvc.Reschedule(context.Background(), row.ID, models.PostTypeText, time.Now().Add(2*time.Hour))
	require.Error(t, err)
	assert.ErrorIs(t, err, repo.ErrNotFound)

	// Right post type → success.
	moved, err := schedSvc.Reschedule(context.Background(), row.ID, models.PostTypePersonal, time.Now().Add(2*time.Hour))
	require.NoError(t, err)
	assert.Equal(t, models.PostTypePersonal, moved.PostType)
	assert.True(t, moved.ScheduledAt.After(row.ScheduledAt))
}

// TestScheduler_PublishNow_Personal_PostsViaSidecar asserts that
// "Đăng ngay" on a personal row resolves the kit account, calls the
// sidecar /profile-post route with the right caption + profile path,
// and stores the returned post URL as facebook_post_id.
func TestScheduler_PublishNow_Personal_PostsViaSidecar(t *testing.T) {
	d := testutil.NewPostgres(t)
	schedRepo := repo.NewSchedulerRepo(db.New(d.Pool))
	pagesRepo := repo.NewPagesRepo(db.New(d.Pool), nil)
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	pub := service.NewPublisher(nil, nil, pagesRepo, log)

	kitUUID := uuid.New()
	profilePath := "/tmp/dan-profile"
	fk := newSchedulerFakeKitLoaderWithUUID(kitUUID, "dan", profilePath)

	var (
		capturedPath   string
		capturedCap    string
		capturedMedia  []string
		mu             sync.Mutex
		profilePostHit bool
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/profile-post" {
			http.NotFound(w, r)
			return
		}
		var body struct {
			ProfilePath string   `json:"profilePath"`
			Caption     string   `json:"caption"`
			MediaURLs   []string `json:"mediaUrls"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad body", http.StatusBadRequest)
			return
		}
		mu.Lock()
		profilePostHit = true
		capturedPath = body.ProfilePath
		capturedCap = body.Caption
		capturedMedia = body.MediaURLs
		mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"result": map[string]any{
				"success": true,
				"postUrl": "https://www.facebook.com/dan/posts/999",
				"error":   "",
			},
		})
	}))
	t.Cleanup(srv.Close)
	sidecar := service.NewSidecarClient(srv.URL)

	schedSvc := service.NewScheduler(schedRepo, pagesRepo, pub, sidecar, fk, log)

	row, err := schedSvc.SchedulePersonal(context.Background(), kitUUID.String(),
		"Đăng ngay!", time.Now().Add(1*time.Hour),
		[]string{"https://example.com/img.png"})
	require.NoError(t, err)

	published, err := schedSvc.PublishNow(context.Background(), row.ID)
	require.NoError(t, err)
	assert.Equal(t, models.ScheduleStatusPublished, published.Status)
	require.NotNil(t, published.FacebookPostID)
	assert.Equal(t, "https://www.facebook.com/dan/posts/999", *published.FacebookPostID)

	mu.Lock()
	defer mu.Unlock()
	assert.True(t, profilePostHit, fmt.Sprintf("sidecar /profile-post must have been called; body=%+v", capturedPath))
	assert.Contains(t, capturedPath, "dan-profile")
	assert.Equal(t, "Đăng ngay!", capturedCap)
	assert.Equal(t, []string{"https://example.com/img.png"}, capturedMedia)
}

// ── helpers ───────────────────────────────────────────────────────────

// newSchedulerFakeKitLoaderWithUUID builds a minimal KitLoader that
// returns the given snapshot for the given UUID. Kept separate from
// the brain_feed_test fake so each test owns its fixture data.
func newSchedulerFakeKitLoaderWithUUID(id uuid.UUID, name, profilePath string) service.KitLoader {
	return &schedulerFakeKitLoader{
		snap: service.KitAccountSnapshot{
			Name:        name,
			ProfilePath: profilePath,
			Status:      "ready",
			Platform:    "facebook",
		},
		uuid: id,
	}
}

type schedulerFakeKitLoader struct {
	snap service.KitAccountSnapshot
	uuid uuid.UUID
}

func (f *schedulerFakeKitLoader) LookupByUUID(ctx context.Context, id uuid.UUID) (service.KitAccountSnapshot, error) {
	if id != f.uuid {
		return service.KitAccountSnapshot{}, service.ErrKitAccountNotFound
	}
	return f.snap, nil
}

func (f *schedulerFakeKitLoader) LookupAll(ctx context.Context) ([]service.KitAccountSnapshot, error) {
	return []service.KitAccountSnapshot{f.snap}, nil
}

func (f *schedulerFakeKitLoader) Invalidate() {}