package service

import (
	"context"
	"sync"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
)

// BrainStatsStore is the FB-side count surface used by BrainStatsService.
// *BrainFeedRepo (via CountByStatus) and *BrainDraftRepo (via
// CountDraftsByStatus) both satisfy this interface.
type BrainStatsStore interface {
	CountByStatus(ctx context.Context) (map[string]int64, error)
	CountDraftsByStatus(ctx context.Context) (map[string]int64, error)
}

// BrainStatsClient is the Brain MCP surface used by BrainStatsService. The
// concrete *mcp.BrainClient implements this; tests inject a fake.
type BrainStatsClient interface {
	GetLearningState(ctx context.Context, scope map[string]string, status string, targetType string) (*mcp.GetLearningStateResult, error)
	QueryGraph(ctx context.Context, scope map[string]string, entityTypes []string, limit int) (*mcp.QueryGraphResult, error)
}

// BrainStatsService aggregates stats from the FB-side DB (feed + draft
// counts) and the Brain MCP (learning signals + graph entities) in
// parallel. Brain-side calls share a single 5s timeout so a slow/down
// brain never blocks the dashboard. Failures on the brain side become
// warnings; FB-side failures are fatal (the DB is the source of truth).
type BrainStatsService struct {
	store        BrainStatsStore
	brain        BrainStatsClient
	scope        map[string]string
	brainTimeout time.Duration
}

// NewBrainStatsService wires a BrainStatsService. brainTimeout defaults
// to 5s when zero. A nil brain is allowed (dev mode without mdp-brain
// installed); brain-side calls become no-ops that record a warning.
func NewBrainStatsService(store BrainStatsStore, brain BrainStatsClient, scope map[string]string) *BrainStatsService {
	return &BrainStatsService{
		store:        store,
		brain:        brain,
		scope:        scope,
		brainTimeout: 5 * time.Second,
	}
}

// BrainOverview is the dashboard top-level aggregation. JSON tags match
// the frontend wire format.
type BrainOverview struct {
	Feeds    map[string]int64 `json:"feeds"`
	Drafts   map[string]int64 `json:"drafts"`
	Brain    BrainCounts      `json:"brain"`
	Graph    GraphStats       `json:"graph"`
	Recent7d Recent7d         `json:"recent_7d"`
	Warnings []string         `json:"warnings,omitempty"`
}

// BrainCounts summarizes Brain-side counters.
type BrainCounts struct {
	TotalMemories        int64 `json:"total_memories"`
	TotalRules           int64 `json:"total_rules"`
	TotalProfiles        int64 `json:"total_profiles"`
	TotalLearningSignals int64 `json:"total_learning_signals"`
}

// GraphStats summarizes the Brain entity graph.
type GraphStats struct {
	TotalEntities int64            `json:"total_entities"`
	ByType        map[string]int64 `json:"by_type"`
}

// Recent7d is reserved for time-windowed counters (ingests/generates/
// publishes in the last 7 days). The current Brain MCP surface does not
// return these directly, so they stay at zero until a dedicated count
// endpoint lands.
type Recent7d struct {
	Ingests       int64 `json:"ingests"`
	Generates     int64 `json:"generates"`
	Publishes     int64 `json:"publishes"`
	FeedbackCount int64 `json:"feedback_count"`
}

// GetOverview fans out 4 calls (2 FB-side, 2 Brain-side) and returns
// the aggregated BrainOverview. FB-side errors are returned; Brain-side
// errors are recorded as warnings so the dashboard still renders partial
// data when the Brain MCP is slow or down.
func (s *BrainStatsService) GetOverview(ctx context.Context) (*BrainOverview, error) {
	out := &BrainOverview{
		Feeds:  map[string]int64{},
		Drafts: map[string]int64{},
		Graph:  GraphStats{ByType: map[string]int64{}},
	}

	var (
		wg        sync.WaitGroup
		mu        sync.Mutex
		warnings  []string
		fbErr     error
		fbErrOnce sync.Once
	)
	recordFBErr := func(err error) {
		fbErrOnce.Do(func() {
			fbErr = err
		})
	}
	recordWarning := func(msg string) {
		mu.Lock()
		warnings = append(warnings, msg)
		mu.Unlock()
	}

	// FB-side counts (DB). Failures here are fatal.
	wg.Add(2)
	go func() {
		defer wg.Done()
		m, err := s.store.CountByStatus(ctx)
		if err != nil {
			recordFBErr(err)
			return
		}
		mu.Lock()
		out.Feeds = m
		mu.Unlock()
	}()
	go func() {
		defer wg.Done()
		m, err := s.store.CountDraftsByStatus(ctx)
		if err != nil {
			recordFBErr(err)
			return
		}
		mu.Lock()
		out.Drafts = m
		mu.Unlock()
	}()

	// Brain-side (with shared timeout). Failures here become warnings.
	brainCtx, cancel := context.WithTimeout(ctx, s.brainTimeout)
	defer cancel()

	wg.Add(2)
	go func() {
		defer wg.Done()
		if s.brain == nil {
			recordWarning("learning_state: brain client not configured")
			return
		}
		ls, err := s.brain.GetLearningState(brainCtx, s.scope, "", "")
		if err != nil {
			recordWarning("learning_state: " + err.Error())
			return
		}
		mu.Lock()
		out.Brain.TotalLearningSignals = int64(len(ls.Signals))
		mu.Unlock()
	}()
	go func() {
		defer wg.Done()
		if s.brain == nil {
			recordWarning("graph_query: brain client not configured")
			return
		}
		g, err := s.brain.QueryGraph(brainCtx, s.scope, nil, 0)
		if err != nil {
			recordWarning("graph_query: " + err.Error())
			return
		}
		mu.Lock()
		out.Graph.TotalEntities = int64(len(g.Entities))
		for _, e := range g.Entities {
			out.Graph.ByType[e.Type]++
		}
		mu.Unlock()
	}()

	wg.Wait()
	if fbErr != nil {
		return nil, fbErr
	}
	out.Warnings = warnings
	return out, nil
}
