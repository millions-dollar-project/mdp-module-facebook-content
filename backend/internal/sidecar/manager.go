// Package sidecar manages the lifecycle of the Node.js Playwright
// micro-service ("sidecar") that the Go backend proxies to for browser
// automation (crawl, group post, account login, Kling AI).
//
// In dev, the sidecar was previously expected to be started by hand in a
// second terminal (`cd sidecar && pnpm dev`). This is error-prone — if
// the user forgets, every /account-login/start request fails with
// "connection refused" and the user sees an orphan account in the DB.
//
// EnsureRunning makes the dev loop self-contained: the backend pings the
// sidecar's /health on startup, and if it isn't reachable, spawns the
// sidecar as a tracked child process and waits for it to come up. The
// returned cleanup func kills the child on backend shutdown.
package sidecar

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// Options controls EnsureRunning behavior.
type Options struct {
	// BaseURL is the URL the sidecar listens on, e.g. "http://localhost:9002".
	BaseURL string
	// ScriptPath is the absolute path to the sidecar's entry point
	// (sidecar/src/index.js).
	ScriptPath string
	// NodeBin is the path to the node binary, or just "node" if it's on
	// PATH. Defaults to "node" if empty.
	NodeBin string
	// Autostart controls whether EnsureRunning should spawn a child
	// process when no sidecar is running. When false, a downed sidecar
	// is reported as an error.
	Autostart bool
	// HealthPath is the URL path probed to check liveness. Default "/health".
	HealthPath string
	// PingTimeout is the timeout for the initial /health probe and each
	// retry. Default 500ms.
	PingTimeout time.Duration
	// StartTimeout is the total time to wait for /health to come up after
	// spawn. Default 5s.
	StartTimeout time.Duration
	// Log receives structured events. When nil, a no-op logger is used.
	Log *slog.Logger
}

// EnsureRunning makes sure a sidecar is reachable at BaseURL/HealthPath.
//
// Returns:
//   - (cleanup, nil) when the sidecar is up, where cleanup is a function
//     that kills the child process (no-op when no child was spawned).
//   - (nil, err) when the sidecar is down and either Autostart is false
//     or the spawn + wait-for-health failed.
//
// The returned cleanup is always safe to call multiple times.
func EnsureRunning(ctx context.Context, opts Options) (cleanup func(), err error) {
	if opts.BaseURL == "" {
		return nil, fmt.Errorf("sidecar: BaseURL is required")
	}
	if opts.HealthPath == "" {
		opts.HealthPath = "/health"
	}
	if opts.PingTimeout == 0 {
		opts.PingTimeout = 500 * time.Millisecond
	}
	if opts.StartTimeout == 0 {
		opts.StartTimeout = 5 * time.Second
	}
	if opts.NodeBin == "" {
		opts.NodeBin = "node"
	}
	log := opts.Log
	if log == nil {
		log = slog.New(slog.NewTextHandler(nil, nil)) // discards everything
	}
	healthURL := opts.BaseURL + opts.HealthPath

	// Fast path: sidecar is already up. Don't spawn, don't wait.
	if pingHealth(ctx, healthURL, opts.PingTimeout) == nil {
		log.Info("sidecar already running", "url", opts.BaseURL)
		return noopCleanup, nil
	}

	if !opts.Autostart {
		return nil, fmt.Errorf("sidecar at %s not reachable and Autostart=false", healthURL)
	}

	if opts.ScriptPath == "" {
		return nil, fmt.Errorf("sidecar not running and no ScriptPath configured")
	}

	// Spawn the sidecar as a child process and wait for /health to come up.
	cmd := exec.CommandContext(ctx, opts.NodeBin, opts.ScriptPath)
	cmd.Env = append(cmd.Environ(), "SIDECAR_PORT="+portFromURL(opts.BaseURL))
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	// Best-effort: stream child output through the parent logger with a
	// "[sidecar]" prefix so the dev sees what's happening.
	go logPipe(log, "stdout", stdout)
	go logPipe(log, "stderr", stderr)

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("sidecar spawn failed: %w", err)
	}
	log.Info("sidecar spawned", "pid", cmd.Process.Pid, "url", opts.BaseURL)

	// Wait for /health to come up.
	pollCtx, cancel := context.WithTimeout(ctx, opts.StartTimeout)
	defer cancel()
	if err := waitForHealth(pollCtx, healthURL, opts.PingTimeout); err != nil {
		// Best-effort: kill the child so we don't leak a process.
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return nil, fmt.Errorf("sidecar did not become healthy within %s: %w", opts.StartTimeout, err)
	}
	log.Info("sidecar ready", "url", opts.BaseURL)

	var once sync.Once
	cleanup = func() {
		once.Do(func() {
			if cmd.Process == nil {
				return
			}
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		})
	}
	return cleanup, nil
}

// noopCleanup is the cleanup returned when no child process was spawned.
func noopCleanup() {}

// pingHealth does a single GET against url and returns nil on 200, error
// otherwise. Uses an isolated client so timeouts don't leak into the rest
// of the program.
func pingHealth(ctx context.Context, url string, timeout time.Duration) error {
	c := &http.Client{Timeout: timeout}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("sidecar /health returned %d", resp.StatusCode)
	}
	return nil
}

// waitForHealth polls pingHealth at 100ms intervals until it returns nil
// or ctx is canceled.
func waitForHealth(ctx context.Context, url string, timeout time.Duration) error {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		if err := pingHealth(ctx, url, timeout); err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			// try again
		}
	}
}

// portFromURL extracts the port from "http://host:port" or "http://host".
// Returns empty string when not parseable.
func portFromURL(rawURL string) string {
	// We don't want a full URL parse here because BaseURL is a friendly
	// value like "http://localhost:9002" without a trailing path. A
	// simple substring scan is sufficient and avoids net/url import
	// overhead.
	const scheme = "http://"
	if len(rawURL) < len(scheme) {
		return ""
	}
	rest := rawURL[len(scheme):]
	// Trim path if any.
	for i := 0; i < len(rest); i++ {
		if rest[i] == '/' {
			rest = rest[:i]
			break
		}
	}
	// Find ':' separator.
	for i := 0; i < len(rest); i++ {
		if rest[i] == ':' {
			return rest[i+1:]
		}
	}
	// No port specified — caller is using default; leave empty.
	return ""
}

// logPipe streams each line of r through the logger with a
// [sidecar:<stream>] prefix. The goroutine exits when r returns EOF
// (which happens when the child process closes its end of the pipe).
func logPipe(log *slog.Logger, stream string, r io.Reader) {
	scanner := bufio.NewScanner(r)
	// Allow long log lines (e.g. tracebacks).
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), "\r\n")
		if line == "" {
			continue
		}
		log.Info("[sidecar] "+line, "stream", stream)
	}
}
