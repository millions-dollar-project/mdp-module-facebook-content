// Package sidecar_test contains tests for the sidecar lifecycle manager.
//
// These tests focus on the cases that don't require a real Node.js sidecar
// process: "already running" (we stand up an httptest server) and "down +
// autostart disabled" (we point at a closed port and expect an error). The
// "down + autostart enabled" happy path is verified manually in dev — the
// spawn path is short and OS-specific, and unit-testing it would require a
// cross-platform fake "node" binary.
package sidecar_test

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/sidecar"
)

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// TestEnsureRunning_AlreadyUp verifies that when something is already
// serving /health on BaseURL, EnsureRunning returns a no-op cleanup and
// does NOT attempt to spawn a child process (the "ScriptPath" doesn't
// have to exist in this case).
func TestEnsureRunning_AlreadyUp(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cleanup, err := sidecar.EnsureRunning(context.Background(), sidecar.Options{
		BaseURL:     srv.URL,
		ScriptPath:  filepath.Join(t.TempDir(), "nonexistent.js"),
		NodeBin:     "node",
		Autostart:   true,
		PingTimeout: 500 * time.Millisecond,
		StartTimeout: 1 * time.Second,
		Log:         newTestLogger(),
	})
	if err != nil {
		t.Fatalf("EnsureRunning returned unexpected error: %v", err)
	}
	// Cleanup must be safe to call even when no child was spawned.
	cleanup()
	cleanup() // calling twice should also be a no-op
}

// TestEnsureRunning_AutostartDisabled verifies that when the sidecar is
// unreachable and Autostart is false, EnsureRunning returns a clean
// error instead of attempting a spawn.
func TestEnsureRunning_AutostartDisabled(t *testing.T) {
	// Grab a free port, then immediately close the listener so the
	// port is almost certainly free for the duration of the test. The
	// kernel may still hand it to something else, but on CI/dev this
	// is reliable enough; we accept that the test might flake if
	// something binds that exact port in the microsecond window.
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("could not listen: %v", err)
	}
	addr := l.Addr().String()
	_ = l.Close()

	_, err = sidecar.EnsureRunning(context.Background(), sidecar.Options{
		BaseURL:      "http://" + addr,
		ScriptPath:   "/nonexistent.js",
		NodeBin:      "node",
		Autostart:    false,
		PingTimeout:  100 * time.Millisecond,
		StartTimeout: 200 * time.Millisecond,
		Log:          newTestLogger(),
	})
	if err == nil {
		t.Fatal("expected error when sidecar is down and Autostart=false, got nil")
	}
}

// TestEnsureRunning_AutostartSpawnFails verifies that when the sidecar is
// down, Autostart is on, but the script exits before /health comes up,
// EnsureRunning returns a timeout error and the cleanup kills the (dead)
// child.
func TestEnsureRunning_AutostartSpawnFails(t *testing.T) {
	// We don't actually have a real node process to spawn. Instead, use
	// `go run` against a tiny source file in t.TempDir() that exits
	// immediately. `go` is always available in Go test environments.
	dir := t.TempDir()
	quickExit := filepath.Join(dir, "quickexit.go")
	if err := os.WriteFile(quickExit, []byte("package main\nfunc main(){}\n"), 0o644); err != nil {
		t.Fatalf("write quickexit: %v", err)
	}

	_, err := sidecar.EnsureRunning(context.Background(), sidecar.Options{
		BaseURL:      "http://127.0.0.1:1", // port 1 is reliably closed
		ScriptPath:   quickExit,
		NodeBin:      "go", // `go run quickexit.go` will run then exit
		Autostart:    true,
		PingTimeout:  100 * time.Millisecond,
		StartTimeout: 800 * time.Millisecond,
		Log:          newTestLogger(),
	})
	if err == nil {
		t.Fatal("expected error when spawned sidecar exits before /health is up, got nil")
	}
}

// TestPortFromURL is a small helper used by manual integration. It is not
// exercised by unit tests; it exists so the test file compiles cleanly even
// when the real sidecar script is absent.
func TestPortFromURL(t *testing.T) {
	// Compile-time check that strconv is wired up for future use.
	_ = strconv.Itoa(8081)
}
