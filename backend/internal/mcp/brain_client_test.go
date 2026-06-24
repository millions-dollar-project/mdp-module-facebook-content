package mcp

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

// stubBrainServer is a Go-built minimal MCP stdio server used by tests.
// It reads canned responses from a file (one JSON per line) via the
// STUB_RESPONSES_FILE env var, and emits them in order to stdout framed
// as JSON-RPC responses. The client picks up the env var from the parent
// process; tests set it via t.Setenv.
type stubBrainServer struct {
	bin    string
	tmpdir string
}

func (s *stubBrainServer) BinaryPath() string { return s.bin }
func (s *stubBrainServer) Close()            { os.RemoveAll(s.tmpdir) }

// newStubServer builds a stub brain server into a temp dir. The `responses`
// argument controls what the stub returns: a slice of JSON strings, each
// representing a single-line JSON-RPC response to emit for the next call.
// If responses is empty, the stub falls back to method-aware defaults for
// `tools/call ingest_content` and `tools/call prepare_content_input`.
func newStubServer(t *testing.T, responses []string) *stubBrainServer {
	t.Helper()
	tmp, err := os.MkdirTemp("", "stub-brain-")
	if err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(tmp, "stub.go")
	respFile := filepath.Join(tmp, "responses.jsonl")
	f, _ := os.Create(respFile)
	for _, r := range responses {
		f.WriteString(r + "\n")
	}
	f.Close()

	// The stub reads STUB_RESPONSES_FILE from the inherited env and emits
	// the canned lines in order. For unknown methods it intentionally
	// does NOT respond, so tests that want a timeout can call them.
	code := `package main
import ("bufio";"encoding/json";"io";"os";"strings")
func main(){
	var lines []string
	if p:=os.Getenv("STUB_RESPONSES_FILE"); p!="" {
		data,_:=os.ReadFile(p)
		raw:=strings.Split(string(data),"\n")
		for _,l := range raw {
			s:=strings.TrimSpace(l)
			if s!="" { lines=append(lines,s) }
		}
	}
	in := bufio.NewReader(os.Stdin)
	enc := json.NewEncoder(os.Stdout)
	i:=0
	for {
		var req map[string]any
		if err := json.NewDecoder(in).Decode(&req); err != nil {
			if err==io.EOF { return }
			return
		}
		m,_:=req["method"].(string)
		if m != "tools/call" {
			// Do not respond — let the client hit its timeout.
			continue
		}
		resp := map[string]any{"jsonrpc":"2.0","id":req["id"]}
		if i < len(lines) {
			_ = json.Unmarshal([]byte(lines[i]), &resp)
			i++
		} else {
			params,_:=req["params"].(map[string]any)
			name,_:=params["name"].(string)
			switch name {
			case "ingest_content":
				resp["result"] = map[string]any{"content_id":"stub-brain-id"}
			case "prepare_content_input":
				resp["result"] = map[string]any{
					"schema_version":"2026-06-14.1",
					"provenance_id":"stub-prov",
					"draft_variants":[]map[string]any{{"index":0,"content":"stub draft"}},
					"validation":map[string]any{"status":"ok"},
					"generation_available":true,
				}
			}
		}
		_ = enc.Encode(resp)
	}
}`
	os.WriteFile(src, []byte(code), 0644)
	bin := filepath.Join(tmp, "stub-brain")
	if runtime.GOOS == "windows" {
		bin += ".exe"
	}
	cmd := exec.Command("go", "build", "-o", bin, src)
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("build stub: %v", err)
	}
	if _, err := os.Stat(bin); err != nil {
		t.Fatalf("stub binary missing: %v", err)
	}
	// Make the canned response file path available to the test via
	// responses.path so newClientFromStub can set the env var.
	_ = os.WriteFile(filepath.Join(tmp, "responses.path"), []byte(respFile), 0644)
	return &stubBrainServer{bin: bin, tmpdir: tmp}
}

// newClientFromStub builds a BrainClient that spawns the stub binary with
// STUB_RESPONSES_FILE set so the stub can return canned responses.
func newClientFromStub(t *testing.T, srv *stubBrainServer, timeout time.Duration) *BrainClient {
	t.Helper()
	pathBytes, err := os.ReadFile(filepath.Join(srv.tmpdir, "responses.path"))
	if err != nil {
		t.Fatalf("read responses.path: %v", err)
	}
	t.Setenv("STUB_RESPONSES_FILE", string(pathBytes))
	return NewBrainClient(srv.BinaryPath(), timeout)
}

func TestBrainClient_IngestContent_ReturnsID(t *testing.T) {
	srv := newStubServer(t, []string{
		`{"jsonrpc":"2.0","id":1,"result":{"content_id":"brain-mem-42"}}`,
	})
	defer srv.Close()

	c := newClientFromStub(t, srv, 5*time.Second)
	got, err := c.IngestContent(context.Background(), "hello world")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got != "brain-mem-42" {
		t.Fatalf("want brain-mem-42, got %q", got)
	}
}

func TestBrainClient_PrepareContentInput_ReturnsDraft(t *testing.T) {
	srv := newStubServer(t, []string{
		`{"jsonrpc":"2.0","id":1,"result":{"schema_version":"2026-06-14.1","provenance_id":"prov-99","draft_variants":[{"index":0,"content":"AI draft text"}],"validation":{"status":"ok"},"generation_available":true}}`,
	})
	defer srv.Close()

	c := newClientFromStub(t, srv, 5*time.Second)
	got, err := c.PrepareContentInput(context.Background(), PrepareInput{
		Scope:          Scope{UserID: "u1", Platform: "facebook"},
		Brief:          "test brief",
		Platform:       "facebook",
		DraftRequested: true,
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got.ProvenanceID != "prov-99" {
		t.Fatalf("want prov-99, got %q", got.ProvenanceID)
	}
	if len(got.DraftVariants) != 1 || got.DraftVariants[0].Content != "AI draft text" {
		t.Fatalf("unexpected drafts: %+v", got.DraftVariants)
	}
}

func TestBrainClient_MalformedResponse_ReturnsError(t *testing.T) {
	srv := newStubServer(t, []string{`not-json`})
	defer srv.Close()

	c := newClientFromStub(t, srv, 5*time.Second)
	_, err := c.IngestContent(context.Background(), "x")
	if err == nil {
		t.Fatal("want error, got nil")
	}
	if !errors.Is(err, ErrBrainClient) {
		t.Fatalf("want ErrBrainClient, got %v", err)
	}
}

func TestBrainClient_Timeout_ReturnsError(t *testing.T) {
	srv := newStubServer(t, []string{}) // never responds for unknown method
	defer srv.Close()

	c := newClientFromStub(t, srv, 200*time.Millisecond)
	// Use a method the stub doesn't recognize → no response emitted → timeout
	_, err := c.call(context.Background(), "unknown/method", nil)
	if err == nil {
		t.Fatal("want timeout error, got nil")
	}
}
