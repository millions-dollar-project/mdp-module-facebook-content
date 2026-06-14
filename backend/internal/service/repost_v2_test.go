package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// TestEnsureFuture verifies the past-time guard rejects everything
// from "in the past" up to "30 seconds from now" (the grace window),
// and accepts anything further out.
func TestEnsureFuture(t *testing.T) {
	now := time.Now()
	cases := []struct {
		name    string
		when    time.Time
		wantErr bool
	}{
		{"past hour", now.Add(-time.Hour), true},
		{"now", now, true},
		{"10s future", now.Add(10 * time.Second), true},  // inside grace
		{"29s future", now.Add(29 * time.Second), true},  // inside grace
		{"31s future", now.Add(31 * time.Second), false}, // outside grace
		{"1 hour future", now.Add(time.Hour), false},
		{"1 day future", now.Add(24 * time.Hour), false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := EnsureFuture(c.when)
			if c.wantErr {
				if !errors.Is(err, ErrPastSchedule) {
					t.Fatalf("expected ErrPastSchedule, got %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("expected nil, got %v", err)
			}
		})
	}
}

// TestPlanRepost_RejectsPastItem verifies PlanRepost fails fast when any
// item in the list is in the past — the UI gates this, but the service
// is the last line of defense.
func TestPlanRepost_RejectsPastItem(t *testing.T) {
	svc := &RepostCampaignService{} // no deps; we fail before any repo call
	items := []models.PlanItem{
		{AccountID: "a1", GroupID: "g1", ScheduledAt: time.Now().Add(time.Hour)},
		{AccountID: "a1", GroupID: "g2", ScheduledAt: time.Now().Add(-time.Minute)},
	}
	_, err := svc.PlanRepost(context.Background(), "n", "u", "t", nil, "friendly", items)
	if !errors.Is(err, ErrPastSchedule) {
		t.Fatalf("expected ErrPastSchedule, got %v", err)
	}
}

// TestPlanRepost_RejectsEmpty verifies the empty-list case is rejected
// (we don't want a campaign with zero jobs).
func TestPlanRepost_RejectsEmpty(t *testing.T) {
	svc := &RepostCampaignService{}
	_, err := svc.PlanRepost(context.Background(), "n", "u", "t", nil, "friendly", nil)
	if err == nil {
		t.Fatalf("expected error for empty plan")
	}
}

// TestPlanRepost_RejectsMissingIDs verifies an item with empty
// accountId or groupId is rejected — would otherwise create a job
// with a NULL FK and crash on insert.
func TestPlanRepost_RejectsMissingIDs(t *testing.T) {
	svc := &RepostCampaignService{}
	items := []models.PlanItem{
		{AccountID: "", GroupID: "g1", ScheduledAt: time.Now().Add(time.Hour)},
	}
	_, err := svc.PlanRepost(context.Background(), "n", "u", "t", nil, "friendly", items)
	if err == nil {
		t.Fatalf("expected error for missing accountId")
	}
	if errors.Is(err, ErrPastSchedule) {
		t.Fatalf("expected missing-id error, got past-schedule: %v", err)
	}
}
