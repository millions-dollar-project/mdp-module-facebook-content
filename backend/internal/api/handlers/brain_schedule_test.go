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
// returns canned drafts / failures. Tests that want to assert the
// handler called Generate() with the right contextFeedIDs can also
// inspect the .gotFeedIDs field.
type stubBrainScheduleGenerator struct {
	drafts   []models.BrainDraftRow
	failures []models.GenerateFailure
	err      error

	mu         sync.Mutex
	gotFeedIDs []string
	gotPersona string
}

func (s *stubBrainScheduleGenerator) Generate(ctx context.Context, feedIDs []string, personaID string) ([]models.BrainDraftRow, []models.GenerateFailure, error) {
	s.mu.Lock()
	s.gotFeedIDs = append([]string(nil), feedIDs...)
	s.gotPersona = personaID
	s.mu.Unlock()
	return s.drafts, s.failures, s.err
}

// stubBrainContextLister satisfies BrainFeedContextLister. Tests
// pre-populate .feeds with the rows they want the handler to see
// when it calls ListNewest. The handler ignores createdAt ordering
// in tests — we just return whatever the stub hands back.
type stubBrainContextLister struct {
	mu    sync.Mutex
	feeds []models.BrainFeedRow
	err   error
	// gotLimit is what the handler asked for, captured for assertions.
	gotLimit int
	gotAcct  string
}

func (s *stubBrainContextLister) ListNewest(ctx context.Context, accountID string, limit int) ([]models.BrainFeedRow, error) {
	s.mu.Lock()
	s.gotLimit = limit
	s.gotAcct = accountID
	feeds := append([]models.BrainFeedRow(nil), s.feeds...)
	s.mu.Unlock()
	if s.err != nil {
		return nil, s.err
	}
	if limit > 0 && limit < len(feeds) {
		return feeds[:limit], nil
	}
	return feeds, nil
}

// stubPersonalScheduler satisfies PersonalScheduler and records every
// call so tests can assert slot → content mapping.
type stubPersonalScheduler struct {
	mu    sync.Mutex
	calls []personalCall
	rows  []models.ScheduledPost // cycle through these on each call
	err   error
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
	mu    sync.Mutex
	binds map[string]string // draftID → scheduleID
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

// feedRows builds N brain_feeds rows with predictable ids so tests
// can assert "context was passed in this order".
func feedRows(prefix string, n int) []models.BrainFeedRow {
	out := make([]models.BrainFeedRow, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, models.BrainFeedRow{
			ID:      prefix + "-" + itoa(i+1),
			Content: "crawled post " + itoa(i+1),
		})
	}
	return out
}

// ── tests ─────────────────────────────────────────────────────────────

// TestBrainScheduleHandler_NumDraftsSlotMismatch — defence against the
// UI shipping numDrafts=N but len(slots)=M. 400 + clear error code.
func TestBrainScheduleHandler_NumDraftsSlotMismatch(t *testing.T) {
	h := NewBrainScheduleHandler(
		&stubBrainScheduleGenerator{},
		&stubBrainContextLister{feeds: feedRows("f", 3)},
		&stubPersonalScheduler{},
		&stubBrainDraftBinder{},
		&stubKitAccountResolver{exists: true},
	)
	r := setupScheduleRouter(h)

	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"numDrafts": 3,
		"personaId": "p1",
		"accountId": uuid.NewString(),
		"slots":     []map[string]any{{"scheduledAt": time.Now().Add(2 * time.Hour)}},
	})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "num_drafts_slot_mismatch")
}

// TestBrainScheduleHandler_NumDraftsOutOfRange — defence against the
// UI shipping 0 or > 50 drafts.
func TestBrainScheduleHandler_NumDraftsOutOfRange(t *testing.T) {
	h := NewBrainScheduleHandler(
		&stubBrainScheduleGenerator{},
		&stubBrainContextLister{feeds: feedRows("f", 60)},
		&stubPersonalScheduler{},
		&stubBrainDraftBinder{},
		&stubKitAccountResolver{exists: true},
	)
	r := setupScheduleRouter(h)

	// 0
	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"numDrafts": 0,
		"personaId": "p",
		"accountId": uuid.NewString(),
		"slots":     []map[string]any{},
	})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "num_drafts_out_of_range")

	// 51
	w = postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"numDrafts": 51,
		"personaId": "p",
		"accountId": uuid.NewString(),
		"slots":     make([]map[string]any, 51),
	})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "num_drafts_out_of_range")
}

// TestBrainScheduleHandler_NoCrawledFeeds — the user has never crawled
// anything (or the brain_feeds table is empty for their account).
// 400 with a hint to crawl first, not a 500.
func TestBrainScheduleHandler_NoCrawledFeeds(t *testing.T) {
	h := NewBrainScheduleHandler(
		&stubBrainScheduleGenerator{},
		&stubBrainContextLister{feeds: nil},
		&stubPersonalScheduler{},
		&stubBrainDraftBinder{},
		&stubKitAccountResolver{exists: true},
	)
	r := setupScheduleRouter(h)

	slots := []map[string]any{
		{"scheduledAt": time.Now().Add(1 * time.Hour)},
		{"scheduledAt": time.Now().Add(2 * time.Hour)},
		{"scheduledAt": time.Now().Add(3 * time.Hour)},
	}
	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"numDrafts": 3,
		"personaId": "p",
		"accountId": uuid.NewString(),
		"slots":     slots,
	})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "no_crawled_feeds")
}

// TestBrainScheduleHandler_HappyPath — 10 feeds in context, ask for
// 3 drafts, get exactly 3 schedules. Verifies the "context → K
// drafts" mapping is the actual contract.
func TestBrainScheduleHandler_HappyPath(t *testing.T) {
	feeds := feedRows("ctx", 10)
	// Generator returns 3 drafts (one per requested slot).
	drafts := []models.BrainDraftRow{
		{ID: "d1", FeedID: "ctx-1", Content: "văn bản 1", Status: "draft"},
		{ID: "d2", FeedID: "ctx-2", Content: "văn bản 2", Status: "draft"},
		{ID: "d3", FeedID: "ctx-3", Content: "văn bản 3", Status: "draft"},
	}
	gen := &stubBrainScheduleGenerator{drafts: drafts}
	lister := &stubBrainContextLister{feeds: feeds}
	sched := &stubPersonalScheduler{}
	binder := &stubBrainDraftBinder{}
	resolver := &stubKitAccountResolver{exists: true}
	h := NewBrainScheduleHandler(gen, lister, sched, binder, resolver)
	r := setupScheduleRouter(h)

	// User typed 3 slots at free-form times — no auto-spacing.
	slots := []map[string]any{
		{"scheduledAt": time.Now().Add(10 * time.Minute)},
		{"scheduledAt": time.Now().Add(72 * time.Minute)},
		{"scheduledAt": time.Now().Add(5 * time.Hour)},
	}
	accountID := uuid.NewString()
	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"numDrafts": 3,
		"personaId": "persona-x",
		"accountId": accountID,
		"slots":     slots,
	})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var resp struct {
		Drafts    []map[string]any `json:"drafts"`
		Schedules []map[string]any `json:"schedules"`
		Failures  []map[string]any `json:"failures"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp.Drafts, 3)
	assert.Len(t, resp.Schedules, 3)
	assert.Empty(t, resp.Failures)

	// 3 schedules created at the exact free-form times the user picked.
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

	// Verify context-feed lister was called with limit=3 (= numDrafts)
	// and the user-supplied account id (NOT a feed id).
	lister.mu.Lock()
	defer lister.mu.Unlock()
	assert.Equal(t, 3, lister.gotLimit)
	assert.Equal(t, accountID, lister.gotAcct)

	// Verify the AI generator received the top-3 context feeds from
	// the lister (NOT a 1:1 feed list from the user).
	gen.mu.Lock()
	defer gen.mu.Unlock()
	assert.Equal(t, "persona-x", gen.gotPersona)
	assert.Equal(t, []string{"ctx-1", "ctx-2", "ctx-3"}, gen.gotFeedIDs)
}

// TestBrainScheduleHandler_ContextCapsAtNumDrafts — even when 50
// feeds are in the brain, asking for 3 drafts must cap the context
// at 3 (no point feeding 50 examples to the AI for 3 outputs).
func TestBrainScheduleHandler_ContextCapsAtNumDrafts(t *testing.T) {
	feeds := feedRows("ctx", 50)
	drafts := []models.BrainDraftRow{
		{ID: "d1", FeedID: "ctx-1", Content: "a", Status: "draft"},
		{ID: "d2", FeedID: "ctx-2", Content: "b", Status: "draft"},
		{ID: "d3", FeedID: "ctx-3", Content: "c", Status: "draft"},
	}
	gen := &stubBrainScheduleGenerator{drafts: drafts}
	lister := &stubBrainContextLister{feeds: feeds}
	h := NewBrainScheduleHandler(
		gen, lister, &stubPersonalScheduler{}, &stubBrainDraftBinder{},
		&stubKitAccountResolver{exists: true},
	)
	r := setupScheduleRouter(h)

	slots := []map[string]any{
		{"scheduledAt": time.Now().Add(1 * time.Hour)},
		{"scheduledAt": time.Now().Add(2 * time.Hour)},
		{"scheduledAt": time.Now().Add(3 * time.Hour)},
	}
	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"numDrafts": 3,
		"personaId": "p",
		"accountId": uuid.NewString(),
		"slots":     slots,
	})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	lister.mu.Lock()
	defer lister.mu.Unlock()
	assert.Equal(t, 3, lister.gotLimit, "lister must be asked for numDrafts=3, not 50")
}

// TestBrainScheduleHandler_PartialFailure — when the brain generator
// returns fewer drafts than numDrafts, the missing slots STILL get
// a schedule row (placeholder content + a "draft" failure entry) so
// the Kanban shows the user what went wrong instead of silently
// dropping the slot.
func TestBrainScheduleHandler_PartialFailure(t *testing.T) {
	feeds := feedRows("ctx", 5)
	// Only 1 draft returned; the other 2 slots must still produce
	// a placeholder row.
	drafts := []models.BrainDraftRow{
		{ID: "d2", FeedID: "ctx-2", Content: "ok", Status: "draft"},
	}
	failures := []models.GenerateFailure{
		{FeedID: "ctx-1", Err: "brain timed out"},
		{FeedID: "ctx-3", Err: "blocked by persona filter"},
	}
	gen := &stubBrainScheduleGenerator{drafts: drafts, failures: failures}
	lister := &stubBrainContextLister{feeds: feeds}
	sched := &stubPersonalScheduler{}
	binder := &stubBrainDraftBinder{}
	resolver := &stubKitAccountResolver{exists: true}
	h := NewBrainScheduleHandler(gen, lister, sched, binder, resolver)
	r := setupScheduleRouter(h)

	slots := []map[string]any{
		{"scheduledAt": time.Now().Add(1 * time.Hour)},
		{"scheduledAt": time.Now().Add(2 * time.Hour)},
		{"scheduledAt": time.Now().Add(3 * time.Hour)},
	}
	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"numDrafts": 3,
		"personaId": "p",
		"accountId": uuid.NewString(),
		"slots":     slots,
	})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var resp struct {
		Drafts    []map[string]any `json:"drafts"`
		Schedules []map[string]any `json:"schedules"`
		Failures  []struct {
			Index   int    `json:"index"`
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
	// 2 failures, both at the "draft" stage.
	assert.Len(t, resp.Failures, 2)
	for _, f := range resp.Failures {
		assert.Equal(t, "draft", f.Stage)
		assert.True(t,
			strings.Contains(f.Message, "brain timed out") || strings.Contains(f.Message, "blocked by persona filter"),
			"unexpected failure message: %s", f.Message,
		)
	}

	// The 3 calls into SchedulePersonal: 1 with real content, 2 with
	// placeholder content that starts with the brain-blocked marker.
	require.Len(t, sched.calls, 3)
	var placeholders int
	for _, c := range sched.calls {
		if strings.HasPrefix(c.Content, "# brain-blocked: ") {
			placeholders++
		}
	}
	assert.Equal(t, 2, placeholders, "2 failed slots should get placeholder content")
}

// TestBrainScheduleHandler_SlotInPast — if any slot is in the past,
// the handler returns 400 with a clear "slot_in_past" code so the
// user fixes it in the popup before resubmitting.
func TestBrainScheduleHandler_SlotInPast(t *testing.T) {
	h := NewBrainScheduleHandler(
		&stubBrainScheduleGenerator{},
		&stubBrainContextLister{feeds: feedRows("f", 3)},
		&stubPersonalScheduler{},
		&stubBrainDraftBinder{},
		&stubKitAccountResolver{exists: true},
	)
	r := setupScheduleRouter(h)

	slots := []map[string]any{
		{"scheduledAt": time.Now().Add(1 * time.Hour)},
		{"scheduledAt": time.Now().Add(-10 * time.Minute)}, // past
		{"scheduledAt": time.Now().Add(2 * time.Hour)},
	}
	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"numDrafts": 3,
		"personaId": "p",
		"accountId": uuid.NewString(),
		"slots":     slots,
	})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "slot_in_past")
}

// TestBrainScheduleHandler_KitAccountNotFound — pre-flight 404 if the
// supplied accountId doesn't resolve. Avoids spawning N schedule
// inserts that all fail with the same root cause.
func TestBrainScheduleHandler_KitAccountNotFound(t *testing.T) {
	gen := &stubBrainScheduleGenerator{}
	lister := &stubBrainContextLister{feeds: feedRows("f", 3)}
	sched := &stubPersonalScheduler{}
	binder := &stubBrainDraftBinder{}
	resolver := &stubKitAccountResolver{exists: false}
	h := NewBrainScheduleHandler(gen, lister, sched, binder, resolver)
	r := setupScheduleRouter(h)

	w := postJSON(r, "/api/v1/facebook/brain/generate-and-schedule", map[string]any{
		"numDrafts": 1,
		"personaId": "p",
		"accountId": uuid.NewString(),
		"slots":     []map[string]any{{"scheduledAt": time.Now().Add(1 * time.Hour)}},
	})
	assert.Equal(t, http.StatusNotFound, w.Code)
	assert.Contains(t, w.Body.String(), "kit_account_not_found")
	assert.Empty(t, sched.calls, "no schedule inserts on a 404 pre-flight")
	assert.Empty(t, binder.binds)
}
