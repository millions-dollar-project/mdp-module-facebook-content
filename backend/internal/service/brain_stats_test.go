package service

import (
	"context"
	"errors"
	"testing"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
)

type fakeStatsStore struct {
	feedByStatus  map[string]int64
	draftByStatus map[string]int64
	feedErr       error
	draftErr      error
}

func (f *fakeStatsStore) CountByStatus(ctx context.Context) (map[string]int64, error) {
	if f.feedErr != nil {
		return nil, f.feedErr
	}
	return f.feedByStatus, nil
}

func (f *fakeStatsStore) CountDraftsByStatus(ctx context.Context) (map[string]int64, error) {
	if f.draftErr != nil {
		return nil, f.draftErr
	}
	return f.draftByStatus, nil
}

type fakeStatsBrain struct {
	learningSignals []mcp.LearningSignal
	entities        []mcp.GraphEntity
	learningErr     error
	graphErr        error
}

func (f *fakeStatsBrain) GetLearningState(ctx context.Context, scope map[string]string, status string, targetType string) (*mcp.GetLearningStateResult, error) {
	if f.learningErr != nil {
		return nil, f.learningErr
	}
	return &mcp.GetLearningStateResult{Signals: f.learningSignals}, nil
}

func (f *fakeStatsBrain) QueryGraph(ctx context.Context, scope map[string]string, entityTypes []string, limit int) (*mcp.QueryGraphResult, error) {
	if f.graphErr != nil {
		return nil, f.graphErr
	}
	return &mcp.QueryGraphResult{Entities: f.entities}, nil
}

func TestBrainStatsService_GetOverview_HappyPath(t *testing.T) {
	store := &fakeStatsStore{
		feedByStatus:  map[string]int64{"ingested": 10, "generated": 5, "pushed": 3, "failed": 1},
		draftByStatus: map[string]int64{"pending": 4, "approved": 3, "rejected": 1, "blocked": 0},
	}
	brain := &fakeStatsBrain{
		learningSignals: []mcp.LearningSignal{{ID: "s1"}, {ID: "s2"}},
		entities: []mcp.GraphEntity{
			{ID: "e1", Type: "page"},
			{ID: "e2", Type: "page"},
			{ID: "e3", Type: "topic"},
		},
	}
	svc := NewBrainStatsService(store, brain, map[string]string{"user_id": "u1"})
	out, err := svc.GetOverview(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if out.Feeds["ingested"] != 10 {
		t.Fatalf("want 10 ingested, got %d", out.Feeds["ingested"])
	}
	if out.Drafts["approved"] != 3 {
		t.Fatalf("want 3 approved drafts, got %d", out.Drafts["approved"])
	}
	if out.Brain.TotalLearningSignals != 2 {
		t.Fatalf("want 2 signals, got %d", out.Brain.TotalLearningSignals)
	}
	if out.Graph.TotalEntities != 3 {
		t.Fatalf("want 3 entities, got %d", out.Graph.TotalEntities)
	}
	if out.Graph.ByType["page"] != 2 {
		t.Fatalf("want 2 pages, got %d", out.Graph.ByType["page"])
	}
	if out.Graph.ByType["topic"] != 1 {
		t.Fatalf("want 1 topic, got %d", out.Graph.ByType["topic"])
	}
	if len(out.Warnings) != 0 {
		t.Fatalf("want 0 warnings, got %d (%v)", len(out.Warnings), out.Warnings)
	}
}

func TestBrainStatsService_GetOverview_BrainDown_PartialResult(t *testing.T) {
	store := &fakeStatsStore{
		feedByStatus:  map[string]int64{"ingested": 5},
		draftByStatus: map[string]int64{"pending": 2},
	}
	brain := &fakeStatsBrain{learningErr: errors.New("brain dead"), graphErr: errors.New("brain dead")}
	svc := NewBrainStatsService(store, brain, map[string]string{"user_id": "u1"})
	out, err := svc.GetOverview(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if out.Feeds["ingested"] != 5 {
		t.Fatalf("FB feed counts should still work, got %d", out.Feeds["ingested"])
	}
	if out.Drafts["pending"] != 2 {
		t.Fatalf("FB draft counts should still work, got %d", out.Drafts["pending"])
	}
	if out.Brain.TotalLearningSignals != 0 {
		t.Fatal("Brain count should be 0 when brain MCP is down")
	}
	if out.Graph.TotalEntities != 0 {
		t.Fatal("Graph count should be 0 when brain MCP is down")
	}
	if len(out.Warnings) != 2 {
		t.Fatalf("want 2 warnings, got %d (%v)", len(out.Warnings), out.Warnings)
	}
}

func TestBrainStatsService_GetOverview_FBErr_Fatal(t *testing.T) {
	store := &fakeStatsStore{feedErr: errors.New("db down")}
	brain := &fakeStatsBrain{}
	svc := NewBrainStatsService(store, brain, map[string]string{"user_id": "u1"})
	if _, err := svc.GetOverview(context.Background()); err == nil {
		t.Fatal("expected FB-side error to propagate")
	}
}
