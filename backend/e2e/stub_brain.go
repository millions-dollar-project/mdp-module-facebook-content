//go:build stub_brain

// stub_brain is a minimal MCP stdio server that emulates mdp-brain's
// ingest_content and prepare_content_input tools. It reads canned
// responses from STUB_BRAIN_RESPONSES_FILE (one JSON-RPC response per
// line). If unset or exhausted, returns sensible defaults.
//
// Build:  go build -tags stub_brain -o stub_brain e2e/stub_brain.go
// Usage:  ./stub_brain
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
)

func main() {
	var responses []string
	if f := os.Getenv("STUB_BRAIN_RESPONSES_FILE"); f != "" {
		if data, err := os.ReadFile(f); err == nil {
			for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
				if line != "" {
					responses = append(responses, line)
				}
			}
		}
	}
	in := bufio.NewReader(os.Stdin)
	enc := json.NewEncoder(os.Stdout)
	idx := 0
	for {
		var req map[string]any
		if err := json.NewDecoder(in).Decode(&req); err != nil {
			if err == io.EOF {
				return
			}
			fmt.Fprintf(os.Stderr, "stub_brain decode error: %v\n", err)
			return
		}
		resp := map[string]any{"jsonrpc": "2.0", "id": req["id"]}
		if idx < len(responses) {
			if err := json.Unmarshal([]byte(responses[idx]), &resp); err != nil {
				fmt.Fprintf(os.Stderr, "stub_brain canned response parse error at idx %d: %v\n", idx, err)
			}
			idx++
		} else {
			if m, _ := req["method"].(string); m == "tools/call" {
				if params, ok := req["params"].(map[string]any); ok {
					name, _ := params["name"].(string)
					switch name {
					case "ingest_content":
						resp["result"] = map[string]any{"content_id": "stub-brain-id"}
					case "prepare_content_input":
						resp["result"] = map[string]any{
							"schema_version":       "2026-06-14.1",
							"provenance_id":        "stub-prov",
							"draft_variants":       []map[string]any{{"index": 0, "content": "stub draft from " + name}},
							"validation":           map[string]any{"status": "ok"},
							"generation_available": true,
						}
					default:
						resp["result"] = map[string]any{"ok": true}
					}
				}
			}
		}
		_ = enc.Encode(resp)
	}
}
