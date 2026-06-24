package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"sync/atomic"
	"time"
)

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
	binary  string
	timeout time.Duration

	mu     sync.Mutex
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader
	nextID atomic.Int64
}

func NewBrainClient(binaryPath string, timeout time.Duration) *BrainClient {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &BrainClient{binary: binaryPath, timeout: timeout}
}

// call sends one JSON-RPC request and waits for the matching response (by id).
// Locks the client for the duration of the call to serialize concurrent calls.
func (c *BrainClient) call(ctx context.Context, method string, params map[string]any) (map[string]any, error) {
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

// IngestContent calls the ingest_content tool on mdp-brain. Returns the
// brain memory ID assigned to the content.
func (c *BrainClient) IngestContent(ctx context.Context, content string) (string, error) {
	res, err := c.call(ctx, "tools/call", map[string]any{
		"name":      "ingest_content",
		"arguments": map[string]any{"content": content, "source": "facebook_crawl"},
	})
	if err != nil {
		return "", err
	}
	id, _ := res["content_id"].(string)
	if id == "" {
		return "", fmt.Errorf("%w: missing content_id", ErrBrainClient)
	}
	return id, nil
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
