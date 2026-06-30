package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// stubBrainScheduleGenerator satisfies BrainScheduleGenerator and
// returns canned drafts / failures.
type stubBrainScheduleGenerator struct {
	drafts   []models.BrainDraftRow
	failures []models.GenerateFailure
	err      error
}

func (s *stubBrainScheduleGenerator) Generate(ctx context.Context, feedIDs []string, personaID string) ([]models.BrainDraftRow, []models.GenerateFailure, error) {
	return s.drafts, s.failures, s.err
}

// stubPersonalScheduler satisfies PersonalScheduler and records every
// call so tests can assert slot → content mapping.
type stubPersonalScheduler struct {
	mu      sync.Mutex
	calls   []personalCall
	rows    []models.ScheduledPost // cycle through these on each call
	err     error
}

type personalCall struct {
	AccountID   string
	Content     string
	ScheduledAt time.Time
	MediaURLs   []string
}

func (s *stubPersonalScheduler) SchedulePersonal(ctx context.Context, accountID string, content string, scheduledAt time.Time, mediaURLs []string) (models.ScheduledPost, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, personalCall{AccountID: accountID, Content: content, ScheduledAt: scheduledAt, MediaURLs: mediaURLs})
	if s.err != nil {
		return models.ScheduledPost{}, s.err
	}
	idx := len(s.calls) - 1
	if len(s.rows) == 0 {
		// Default: synthetic row with a fresh uuid so callers don't all
		// share the same id.
		return models.ScheduledPost{
			ID:          uuid.NewString(),
			Content:     content,
			ScheduledAt: scheduledAt,
			Status:      models.ScheduleStatusScheduled,
			PostType:    models.PostTypePersonal,
		}, nil
	}
	row := s.rows[idx%len(s.rows)]
	row.Content = content
	row.ScheduledAt = scheduledAt
	return row, nil
}

// stubBrainDraftBinder satisfies BrainDraftBinder and tracks which
// draft ids got bound to which schedule ids.
type stubBrainDraftBinder struct {
	mu      sync.Mutex
	binds   map[string]string // draftID → scheduleID
}

func (s *stubBrainDraftBinder) MarkPushedRow(ctx context.Context, id string, kanbanJobID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.binds == nil {
		s.binds = map[string]string{}
	}
	s.binds[id] = kanbanJobID
	return nil
}

// stubKitAccountResolver satisfies KitAccountResolver. exists=false
// mimics a 404 (handler returns 404). err non-nil mirrors a lookup
// error.
type stubKitAccountResolver struct {
	exists bool
	err    error
}

func (s *stubKitAccountResolver) LookupByUUID(ctx context.Context, id string) (bool, error) {
	return s.exists, s.err
}

// ── helpers ───────────────────────────────────────────────────────────

func setupScheduleRouter(h *BrainScheduleHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	v1 := r.Group("/api/v1/facebook")
	v1.POST("/brain/generate-and-schedule", h.GenerateAndSchedule)
	return r
}

func postJSON(r *gin.Engine, path string, body any) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ── tests ─────────────────────────────────────────────────────────────

// TestBrainScheduleHandler_FeedSlotMismatch — defence against the UI
// shipping N feeds but M slots. 400 + clear error code.
func TestBrainScheduleHandler_FeedSlotMismatch(t *testing.T) {
	h := NewBrainScheduleHandler(
		&stubBrainScheduleGenerator{},
		&stubPersonalScheduler{},
		&stubBrainDraftBinder{},
		&stubKitAccountResolver{exists: true},
	)
	r := setupScheduleRouter(h)

	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"feedIds":   []string{"f1", "f2"},
		"personaId": "p1",
		"accountId": uuid.NewString(),
		"slots":     []map[string]any{{"scheduledAt": time.Now().Add(2 * time.Hour)}},
	})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "feed_slot_mismatch")
}

// TestBrainScheduleHandler_HappyPath — 3 feeds, 3 slots, 3 drafts.
// Every feed produces a schedule row + a kanban bind.
func TestBrainScheduleHandler_HappyPath(t *testing.T) {
	feedIDs := []string{"f1", "f2", "f3"}
	drafts := []models.BrainDraftRow{
		{ID: "d1", FeedID: "f1", Content: "văn bản 1", Status: "draft"},
		{ID: "d2", FeedID: "f2", Content: "văn bản 2", Status: "draft"},
		{ID: "d3", FeedID: "f3", Content: "văn bản 3", Status: "draft"},
	}
	gen := &stubBrainScheduleGenerator{drafts: drafts}
	sched := &stubPersonalScheduler{}
	binder := &stubBrainDraftBinder{}
	resolver := &stubKitAccountResolver{exists: true}
	h := NewBrainScheduleHandler(gen, sched, binder, resolver)
	r := setupScheduleRouter(h)

	slots := []map[string]any{
		{"scheduledAt": time.Now().Add(1 * time.Hour)},
		{"scheduledAt": time.Now().Add(2 * time.Hour)},
		{"scheduledAt": time.Now().Add(3 * time.Hour)},
	}
	accountID := uuid.NewString()
	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"feedIds":   feedIDs,
		"personaId": "persona-x",
		"accountId": accountID,
		"slots":     slots,
	})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	// 3 schedules created, 3 binds, no failures.
	var resp struct {
		Drafts    []map[string]any `json:"drafts"`
		Schedules []map[string]any `json:"schedules"`
		Failures  []map[string]any `json:"failures"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp.Drafts, 3)
	assert.Len(t, resp.Schedules, 3)
	assert.Empty(t, resp.Failures)

	// Scheduler was called once per slot with the correct content.
	require.Len(t, sched.calls, 3)
	for i, c := range sched.calls {
		assert.Equal(t, accountID, c.AccountID)
		assert.Equal(t, drafts[i].Content, c.Content, "slot %d content", i)
	}

	// Each draft bound to a schedule.
	binder.mu.Lock()
	defer binder.mu.Unlock()
	require.Len(t, binder.binds, 3)
	for _, d := range drafts {
		got, ok := binder.binds[d.ID]
		require.True(t, ok, "draft %s should be bound", d.ID)
		assert.NotEmpty(t, got)
	}
}

// TestBrainScheduleHandler_PartialFailure — when the brain generator
// returns a failure for one feed, the slot must STILL get a schedule
// row (placeholder content + a "draft" failure entry) so the Kanban
// shows the user what went wrong instead of silently dropping the
// slot.
func TestBrainScheduleHandler_PartialFailure(t *testing.T) {
	feedIDs := []string{"f1", "f2", "f3"}
	// Only f2 produced a draft.
	drafts := []models.BrainDraftRow{
		{ID: "d2", FeedID: "f2", Content: "ok", Status: "draft"},
	}
	failures := []models.GenerateFailure{
		{FeedID: "f1", Err: "brain timed out"},
		{FeedID: "f3", Err: "blocked by persona filter"},
	}
	gen := &stubBrainScheduleGenerator{drafts: drafts, failures: failures}
	sched := &stubPersonalScheduler{}
	binder := &stubBrainDraftBinder{}
	resolver := &stubKitAccountResolver{exists: true}
	h := NewBrainScheduleHandler(gen, sched, binder, resolver)
	r := setupScheduleRouter(h)

	slots := []map[string]any{
		{"scheduledAt": time.Now().Add(1 * time.Hour)},
		{"scheduledAt": time.Now().Add(2 * time.Hour)},
		{"scheduledAt": time.Now().Add(3 * time.Hour)},
	}
	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"feedIds":   feedIDs,
		"personaId": "p",
		"accountId": uuid.NewString(),
		"slots":     slots,
	})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var resp struct {
		Drafts    []map[string]any `json:"drafts"`
		Schedules []map[string]any `json:"schedules"`
		Failures  []struct {
			FeedID  string `json:"feedId"`
			Stage   string `json:"stage"`
			Message string `json:"message"`
		} `json:"failures"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	// All 3 slots produced a schedule row (placeholder for failures).
	assert.Len(t, resp.Schedules, 3)
	// Only 1 happy draft.
	assert.Len(t, resp.Drafts, 1)
	assert.Equal(t, "d2", resp.Drafts[0]["draftId"])
	// 2 failures, both at the "draft" stage with the messages from gen.
	assert.Len(t, resp.Failures, 2)
	gotFeedIDs := map[string]string{}
	for _, f := range resp.Failures {
		assert.Equal(t, "draft", f.Stage)
		gotFeedIDs[f.FeedID] = f.Message
	}
	assert.Contains(t, gotFeedIDs["f1"], "brain timed out")
	assert.Contains(t, gotFeedIDs["f3"], "blocked by persona filter")

	// The 3 calls into SchedulePersonal: 1 with real content, 2 with
	// placeholder content that includes the failure message.
	require.Len(t, sched.calls, 3)
	var placeholders int
	for _, c := range sched.calls {
		if strings.HasPrefix(c.Content, "# brain-blocked: ") {
			placeholders++
		}
	}
	assert.Equal(t, 2, placeholders, "f1 and f3 should get placeholder content")
}

// TestBrainScheduleHandler_KitAccountNotFound — pre-flight 404 if the
// supplied accountId doesn't resolve. Avoids spawning N schedule
// inserts that all fail with the same root cause.
func TestBrainScheduleHandler_KitAccountNotFound(t *testing.T) {
	gen := &stubBrainScheduleGenerator{}
	sched := &stubPersonalScheduler{}
	binder := &stubBrainDraftBinder{}
	resolver := &stubKitAccountResolver{exists: false}
	h := NewBrainScheduleHandler(gen, sched, binder, resolver)
	r := setupScheduleRouter(h)

	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"feedIds":   []string{"f1"},
		"personaId": "p",
		"accountId": uuid.NewString(),
		"slots":     []map[string]any{{"scheduledAt": time.Now().Add(1 * time.Hour)}},
	})
	assert.Equal(t, http.StatusNotFound, w.Code)
	assert.Contains(t, w.Body.String(), "kit_account_not_found")
	assert.Empty(t, sched.calls, "no schedule inserts on a 404 pre-flight")
	assert.Empty(t, binder.binds)
}