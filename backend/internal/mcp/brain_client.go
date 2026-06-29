package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// filterEnv returns a copy of env with the named keys removed. Used to
// prevent leaking parent-process env (e.g. DATABASE_URL pointing at the
// facebook DB) to a child subprocess that has its own (e.g. mdp-brain
// reads its own .env for postgres on port 5434).
func filterEnv(env []string, dropKeys ...string) []string {
	drop := make(map[string]struct{}, len(dropKeys))
	for _, k := range dropKeys {
		drop[k] = struct{}{}
	}
	out := make([]string, 0, len(env))
	for _, kv := range env {
		eq := strings.IndexByte(kv, '=')
		if eq <= 0 {
			out = append(out, kv)
			continue
		}
		if _, hit := drop[kv[:eq]]; hit {
			continue
		}
		out = append(out, kv)
	}
	return out
}

var ErrBrainClient = errors.New("brain client error")

// Scope mirrors brain.Scope (kept local to avoid import cycle).
type Scope struct {
	UserID    string `json:"user_id,omitempty"`
	ProfileID string `json:"profile_id,omitempty"`
	AccountID string `json:"account_id,omitempty"`
	Platform  string `json:"platform,omitempty"`
}

type PrepareInput struct {
	Scope          Scope    `json:"scope"`
	Platform       string   `json:"platform,omitempty"`
	OutputFormat   string   `json:"output_format,omitempty"`
	Brief          string   `json:"brief"`
	Constraints    []string `json:"constraints,omitempty"`
	DraftRequested bool     `json:"draft_requested"`
}

type DraftVariant struct {
	Index   int    `json:"index"`
	Content string `json:"content"`
}

type ValidationResult struct {
	Status  string   `json:"status"`
	RuleIDs []string `json:"rule_ids,omitempty"`
	Details []string `json:"details,omitempty"`
}

type PrepareResult struct {
	SchemaVersion       string            `json:"schema_version"`
	ProvenanceID        string            `json:"provenance_id"`
	DraftVariants       []DraftVariant    `json:"draft_variants,omitempty"`
	Validation          ValidationResult  `json:"validation"`
	GenerationAvailable bool              `json:"generation_available"`
	Warnings            []string          `json:"warnings,omitempty"`
}

// BrainClient wraps a long-lived mdp-brain MCP stdio subprocess.
type BrainClient struct {
	binary   string
	timeout  time.Duration
	extraEnv map[string]string

	mu          sync.Mutex
	cmd         *exec.Cmd
	stdin       io.WriteCloser
	stdout      *bufio.Reader
	nextID      atomic.Int64
	initialized bool
}

func NewBrainClient(binaryPath string, timeout time.Duration) *BrainClient {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &BrainClient{binary: binaryPath, timeout: timeout}
}

// SetEnv sets extra environment variables to pass to the brain
// subprocess. Used to inject BRAIN_DATABASE_URL (and strip the parent's
// DATABASE_URL which points at the facebook DB) so the child mdp-brain
// process can connect to its own postgres. Safe to call before the
// subprocess is started (lazy on first call).
func (c *BrainClient) SetEnv(env map[string]string) {
	c.extraEnv = env
}

// call sends one JSON-RPC request and waits for the matching response (by id).
// Locks the client for the duration of the call to serialize concurrent calls.
func (c *BrainClient) call(ctx context.Context, method string, params map[string]any) (map[string]any, error) {
	if c == nil {
		return nil, fmt.Errorf("%w: client not initialized", ErrBrainClient)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.ensure(ctx); err != nil {
		return nil, err
	}
	id := c.nextID.Add(1)
	req := map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params}
	if err := json.NewEncoder(c.stdin).Encode(req); err != nil {
		c.kill()
		return nil, fmt.Errorf("%w: encode: %v", ErrBrainClient, err)
	}
	type result struct {
		raw map[string]any
		err error
	}
	done := make(chan result, 1)
	go func() {
		var resp map[string]any
		err := json.NewDecoder(c.stdout).Decode(&resp)
		if err != nil {
			done <- result{err: fmt.Errorf("%w: decode: %v", ErrBrainClient, err)}
			return
		}
		done <- result{raw: resp}
	}()
	timer := time.NewTimer(c.timeout)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		c.kill()
		return nil, ctx.Err()
	case <-timer.C:
		c.kill()
		return nil, fmt.Errorf("%w: timeout after %s", ErrBrainClient, c.timeout)
	case r := <-done:
		if r.err != nil {
			c.kill()
			return nil, r.err
		}
		if errObj, ok := r.raw["error"]; ok {
			return nil, fmt.Errorf("%w: %v", ErrBrainClient, errObj)
		}
		res, _ := r.raw["result"].(map[string]any)
		return res, nil
	}
}

func (c *BrainClient) ensure(ctx context.Context) error {
	if c.stdin != nil {
		return nil
	}
	// Use context.Background() for the subprocess lifecycle so that a
	// per-request context cancellation does not kill the long-lived
	// brain daemon mid-conversation. The request context is still used
	// for per-call timeouts in call().
	cmd := exec.CommandContext(context.Background(), c.binary)
	// Don't inherit our DATABASE_URL (points at the facebook DB) —
	// the brain subprocess reads its own DATABASE_URL via SetEnv
	// (BRAIN_DATABASE_URL is the conventional override; we map it
	// to DATABASE_URL in the child env). Inherit the rest of the env
	// (PATH, OS quirks, etc.) so the binary can find `node`, `go`,
	// etc. on Windows. Setting `Env: nil` would give it an empty env
	// which breaks Windows binary startup.
	env := filterEnv(os.Environ(), "DATABASE_URL")
	for k, v := range c.extraEnv {
		env = append(env, k+"="+v)
	}
	cmd.Env = env
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("%w: stdin pipe: %v", ErrBrainClient, err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("%w: stdout pipe: %v", ErrBrainClient, err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("%w: start: %v", ErrBrainClient, err)
	}
	c.cmd = cmd
	c.stdin = stdin
	c.stdout = bufio.NewReader(stdout)

	// MCP handshake: server rejects `tools/call` with "invalid during
	// session initialization" until we send `initialize` and read the
	// server's response. Protocol revision matches go-sdk/mcp used by
	// mdp-brain (2025-03-26). `notifications/initialized` is a
	// notification (no id, no response expected) — we send it but don't
	// wait for a reply.
	if err := c.handshake(); err != nil {
		c.kill()
		return err
	}
	return nil
}

// handshake sends the JSON-RPC `initialize` request and waits for the
// matching response, then emits the `notifications/initialized`
// notification. After this returns successfully, the server accepts
// `tools/call` requests. Must be called with c.mu held.
func (c *BrainClient) handshake() error {
	id := c.nextID.Add(1)
	req := map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  "initialize",
		"params": map[string]any{
			"protocolVersion": "2025-03-26",
			"capabilities":    map[string]any{},
			"clientInfo": map[string]any{
				"name":    "mdp-fb-content",
				"version": "v0.1.0",
			},
		},
	}
	if err := json.NewEncoder(c.stdin).Encode(req); err != nil {
		return fmt.Errorf("%w: initialize encode: %v", ErrBrainClient, err)
	}
	type result struct {
		raw map[string]any
		err error
	}
	done := make(chan result, 1)
	go func() {
		var resp map[string]any
		err := json.NewDecoder(c.stdout).Decode(&resp)
		if err != nil {
			done <- result{err: fmt.Errorf("%w: initialize decode: %v", ErrBrainClient, err)}
			return
		}
		done <- result{raw: resp}
	}()
	timer := time.NewTimer(c.timeout)
	defer timer.Stop()
	select {
	case <-timer.C:
		return fmt.Errorf("%w: initialize timeout after %s", ErrBrainClient, c.timeout)
	case r := <-done:
		if r.err != nil {
			return r.err
		}
		if errObj, ok := r.raw["error"]; ok {
			return fmt.Errorf("%w: initialize failed: %v", ErrBrainClient, errObj)
		}
		// Validate server replied to OUR id (not someone else's).
		// JSON numbers decode as float64; normalize before comparing.
		var gotID int64
		switch v := r.raw["id"].(type) {
		case float64:
			gotID = int64(v)
		case int64:
			gotID = v
		case int:
			gotID = int64(v)
		default:
			return fmt.Errorf("%w: initialize id missing or wrong type: %T", ErrBrainClient, r.raw["id"])
		}
		if gotID != id {
			return fmt.Errorf("%w: initialize id mismatch: got %d want %d", ErrBrainClient, gotID, id)
		}
	}
	// `notifications/initialized` is a notification — no id, no response.
	// Send-and-forget so we don't block on a reply that won't come.
	notif := map[string]any{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
	}
	if err := json.NewEncoder(c.stdin).Encode(notif); err != nil {
		return fmt.Errorf("%w: notifications/initialized encode: %v", ErrBrainClient, err)
	}
	c.initialized = true
	return nil
}

func (c *BrainClient) kill() {
	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
		_ = c.cmd.Wait()
	}
	c.cmd = nil
	c.stdin = nil
	c.stdout = nil
}

func (c *BrainClient) Close() error {
	c.kill()
	return nil
}

// IngestParams is what IngestContent needs to call the mdp-brain tool
// `brain_ingest_raw_input` (the actual tool name in mdp-brain — the old
// `ingest_content` no longer exists).
type IngestParams struct {
	Content  string         // raw text
	Source   string         // e.g. "facebook_crawl"
	SourceID string         // idempotency key (post URL or hash)
	Kind     string         // "post", "comment", ...
	UserID   string         // owning user id; falls back to "default"
	// AccountID is the kit-account SHA-1 v5 UUID. Threaded through from
	// the per-request `?account_id=` query so future crawls land in a
	// per-account scope row (Brain's `brain_query_graph` filters on
	// `scope @> '{"account_id":"..."}'`). Empty = no account scope
	// (legacy behaviour, scope = {user_id:"default"}).
	AccountID string
	Metadata  map[string]any // optional fields like likes/comments/page
}

// IngestContent calls brain_ingest_raw_input on mdp-brain and returns the
// brain ingestion ID assigned to the content.
func (c *BrainClient) IngestContent(ctx context.Context, p IngestParams) (string, error) {
	if p.Kind == "" {
		p.Kind = "post"
	}
	if p.UserID == "" {
		p.UserID = "default"
	}
	// The mdp-brain tool expects flat scope fields (user_id), not a nested
	// "scope" object. Sending {scope:{...}} fails with "unexpected
	// additional properties [\"scope\"]".
	// mdp-brain has been updated to accept metadata as an open `any`
	// (object/array/null) so a Go map[string]any serialises through fine.
	args := map[string]any{
		"source":    p.Source,
		"source_id": p.SourceID,
		"kind":      p.Kind,
		"content":   p.Content,
		"user_id":   p.UserID,
	}
	// NOTE: `account_id` is intentionally NOT forwarded as a flat arg
	// here. mdp-brain's `brainIngestRawInputIn` struct (mdp-brain/
	// internal/mcp/brain_tools.go:19) currently only declares `user_id`;
	// sending an undeclared key triggers go-sdk/mcp validation
	// ("unexpected additional properties [\"account_id\"]") and the
	// ingest 5xx's. Until mdp-brain adds an `AccountID` field to that
	// input struct, fresh crawls continue to land under scope =
	// {user_id: "default"}.
	//
	// FB-content side is fully wired (CrawledPostInput.AccountUUID ->
	// service.Ingest -> IngestParams.AccountID), so the moment mdp-brain
	// adds the field the only change needed here is:
	//   if p.AccountID != "" { args["account_id"] = p.AccountID }
	if len(p.Metadata) > 0 {
		args["metadata"] = p.Metadata
	}
	res, err := c.call(ctx, "tools/call", map[string]any{
		"name":      "brain_ingest_raw_input",
		"arguments": args,
	})
	if err != nil {
		return "", err
	}
	// MCP tools return { content: [{type:"text", text:"<json string>"}],
	//                    structuredContent: {<parsed object>} }.
	// Prefer structuredContent.ingestion_id, fall back to parsing
	// content[0].text as JSON, then to a top-level content_id for back-compat.
	if sc, ok := res["structuredContent"].(map[string]any); ok {
		if id, _ := sc["ingestion_id"].(string); id != "" {
			return id, nil
		}
	}
	if contentArr, ok := res["content"].([]any); ok && len(contentArr) > 0 {
		if first, ok := contentArr[0].(map[string]any); ok {
			if txt, ok := first["text"].(string); ok && txt != "" {
				var parsed map[string]any
				if err := json.Unmarshal([]byte(txt), &parsed); err == nil {
					if id, _ := parsed["ingestion_id"].(string); id != "" {
						return id, nil
					}
				}
			}
		}
	}
	if id, _ := res["content_id"].(string); id != "" {
		return id, nil
	}
	return "", fmt.Errorf("%w: missing ingestion_id/content_id", ErrBrainClient)
}

// PrepareContentInput calls the prepare_content_input tool on mdp-brain.
func (c *BrainClient) PrepareContentInput(ctx context.Context, in PrepareInput) (*PrepareResult, error) {
	res, err := c.call(ctx, "tools/call", map[string]any{
		"name":      "prepare_content_input",
		"arguments": in,
	})
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(res)
	var out PrepareResult
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, fmt.Errorf("%w: unmarshal: %v", ErrBrainClient, err)
	}
	return &out, nil
}

// ── GetProvenance ─────────────────────────────────────────────────────

type GetProvenanceResult struct {
	ID               string          `json:"id"`
	ContextPackageID string          `json:"context_package_id,omitempty"`
	ProfileID        string          `json:"profile_id,omitempty"`
	ProfileVersion   int             `json:"profile_version,omitempty"`
	AccountID        string          `json:"account_id,omitempty"`
	PromptSkillRefs  json.RawMessage `json:"prompt_skill_refs"`
	RuleRefs         json.RawMessage `json:"rule_refs"`
	Provider         json.RawMessage `json:"provider"`
	Validation       json.RawMessage `json:"validation"`
	SourceInputIDs   json.RawMessage `json:"source_input_ids"`
	SchemaVersion    string          `json:"schema_version"`
	CreatedAt        string          `json:"created_at"`
}

func (c *BrainClient) GetProvenance(ctx context.Context, provenanceID string) (*GetProvenanceResult, error) {
	res, err := c.call(ctx, "tools/call", map[string]any{
		"name":      "brain_get_provenance",
		"arguments": map[string]any{"provenance_id": provenanceID},
	})
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(res)
	var out GetProvenanceResult
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, fmt.Errorf("%w: unmarshal: %v", ErrBrainClient, err)
	}
	return &out, nil
}

// ── GetLearningState ─────────────────────────────────────────────────

type LearningSignal struct {
	ID          string          `json:"id"`
	TargetType  string          `json:"target_type"`
	TargetID    string          `json:"target_id,omitempty"`
	Scope       json.RawMessage `json:"scope"`
	Proposal    json.RawMessage `json:"proposal"`
	Evidence    json.RawMessage `json:"evidence"`
	Confidence  float64         `json:"confidence"`
	ImpactLevel string          `json:"impact_level"`
	Status      string          `json:"status"`
	CreatedAt   string          `json:"created_at"`
}

type GetLearningStateResult struct {
	SchemaVersion string           `json:"schema_version"`
	Signals       []LearningSignal `json:"signals"`
	Warnings      []string         `json:"warnings,omitempty"`
}

func (c *BrainClient) GetLearningState(ctx context.Context, scope map[string]string, status string, targetType string) (*GetLearningStateResult, error) {
	args := map[string]any{}
	for k, v := range scope {
		args[k] = v
	}
	if status != "" {
		args["status"] = status
	}
	if targetType != "" {
		args["target_type"] = targetType
	}
	res, err := c.call(ctx, "tools/call", map[string]any{
		"name":      "brain_get_learning_state",
		"arguments": args,
	})
	if err != nil {
		return nil, err
	}
	parsed := res
	if sc, ok := res["structuredContent"].(map[string]any); ok && len(sc) > 0 {
		parsed = sc
	} else if contentArr, ok := res["content"].([]any); ok && len(contentArr) > 0 {
		if first, ok := contentArr[0].(map[string]any); ok {
			if txt, ok := first["text"].(string); ok && txt != "" {
				var sc map[string]any
				if err := json.Unmarshal([]byte(txt), &sc); err == nil {
					parsed = sc
				}
			}
		}
	}
	b, _ := json.Marshal(parsed)
	var out GetLearningStateResult
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, fmt.Errorf("%w: unmarshal: %v", ErrBrainClient, err)
	}
	return &out, nil
}

// ── QueryGraph ────────────────────────────────────────────────────────

type GraphEntity struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	ExternalRef string          `json:"external_ref,omitempty"`
	Properties  json.RawMessage `json:"properties"`
	CreatedAt   string          `json:"created_at"`
}

type QueryGraphResult struct {
	SchemaVersion string        `json:"schema_version"`
	Entities      []GraphEntity `json:"entities"`
	Warnings      []string      `json:"warnings,omitempty"`
}

func (c *BrainClient) QueryGraph(ctx context.Context, scope map[string]string, entityTypes []string, limit int) (*QueryGraphResult, error) {
	args := map[string]any{}
	for k, v := range scope {
		args[k] = v
	}
	if len(entityTypes) > 0 {
		args["entity_types"] = entityTypes
	}
	if limit > 0 {
		args["limit"] = limit
	}
	res, err := c.call(ctx, "tools/call", map[string]any{
		"name":      "brain_query_graph",
		"arguments": args,
	})
	if err != nil {
		return nil, err
	}
	// MCP server wraps tool results in two parallel payloads:
	//   - structuredContent: the parsed Go struct
	//   - content: [{type:"text", text:"<JSON string of same struct>"}]
	// The go-sdk v1.6.1 sometimes returns structuredContent populated and
	// sometimes only content[0].text — read both, prefer structuredContent.
	parsed := res
	if sc, ok := res["structuredContent"].(map[string]any); ok && len(sc) > 0 {
		parsed = sc
	} else if contentArr, ok := res["content"].([]any); ok && len(contentArr) > 0 {
		if first, ok := contentArr[0].(map[string]any); ok {
			if txt, ok := first["text"].(string); ok && txt != "" {
				var sc map[string]any
				if err := json.Unmarshal([]byte(txt), &sc); err == nil {
					parsed = sc
				}
			}
		}
	}
	b, _ := json.Marshal(parsed)
	var out QueryGraphResult
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, fmt.Errorf("%w: unmarshal: %v", ErrBrainClient, err)
	}
	return &out, nil
}

// ── RecordFeedback ────────────────────────────────────────────────────

type RecordFeedbackInput struct {
	ProvenanceID string   `json:"provenance_id"`
	Action       string   `json:"action"` // "approved" | "rejected" | "edited"
	EditedText   string   `json:"edited_text,omitempty"`
	Notes        string   `json:"notes,omitempty"`
	ReasonTags   []string `json:"reason_tags,omitempty"`
}

type RecordFeedbackResult struct {
	SchemaVersion string   `json:"schema_version"`
	FeedbackID    string   `json:"feedback_id"`
	SignalCreated bool     `json:"signal_created"`
	Warnings      []string `json:"warnings,omitempty"`
}

func (c *BrainClient) RecordFeedback(ctx context.Context, in RecordFeedbackInput) (*RecordFeedbackResult, error) {
	res, err := c.call(ctx, "tools/call", map[string]any{
		"name":      "brain_record_review_feedback",
		"arguments": in,
	})
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(res)
	var out RecordFeedbackResult
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, fmt.Errorf("%w: unmarshal: %v", ErrBrainClient, err)
	}
	return &out, nil
}
