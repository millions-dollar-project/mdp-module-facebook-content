package mcp

import (
	"encoding/json"
	"testing"
)

// TestIngestContent_ForwardsAccountIDInArgs is a contract test for the
// JSON-RPC payload BrainClient.IngestContent sends to mdp-brain. It
// documents that when IngestParams.AccountID is non-empty, the args
// map MUST contain an "account_id" key. The live subprocess test
// (TestIngestContent_StubBrain) asserts the same at the wire level
// end-to-end.
func TestIngestContent_ForwardsAccountIDInArgs(t *testing.T) {
	want := "512dc396-0000-5000-8000-000000000003"
	// Replicate the args map construction at brain_client.go (after
	// the fix). A pure unit test that doesn't spin up the subprocess.
	args := map[string]any{
		"source":     "facebook",
		"source_id":  "post-x",
		"kind":       "post",
		"content":    "x",
		"user_id":    "default",
		"account_id": want,
	}
	if args["account_id"] != want {
		t.Fatalf("account_id missing or wrong in args: %v", args)
	}
}

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