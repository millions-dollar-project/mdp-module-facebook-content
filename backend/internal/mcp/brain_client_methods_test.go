package mcp

import (
	"encoding/json"
	"testing"
)

func TestGetProvenance_ParseSuccess(t *testing.T) {
	raw := `{"id":"prov-1","context_package_id":"ctx-1","profile_id":"prof-1","profile_version":3,"validation":{"status":"ok"}}`
	var out GetProvenanceResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if out.ID != "prov-1" {
		t.Fatalf("id: %s", out.ID)
	}
	if out.ProfileVersion != 3 {
		t.Fatalf("profile version: %d", out.ProfileVersion)
	}
}

func TestGetLearningState_ParseEmpty(t *testing.T) {
	raw := `{"schema_version":"1","signals":[]}`
	var out GetLearningStateResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(out.Signals) != 0 {
		t.Fatalf("expected empty signals")
	}
}

func TestQueryGraph_ParseByType(t *testing.T) {
	raw := `{"schema_version":"1","entities":[{"id":"e1","type":"page"},{"id":"e2","type":"topic"}]}`
	var out QueryGraphResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(out.Entities) != 2 {
		t.Fatalf("expected 2 entities")
	}
	if out.Entities[0].Type != "page" {
		t.Fatalf("type: %s", out.Entities[0].Type)
	}
}

func TestRecordFeedback_ParseAction(t *testing.T) {
	raw := `{"schema_version":"1","feedback_id":"fb-1","signal_created":true}`
	var out RecordFeedbackResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !out.SignalCreated {
		t.Fatal("expected signal_created=true")
	}
}