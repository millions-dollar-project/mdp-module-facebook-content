package service

import (
	"sync"
	"time"
)

// ─── Token-Bucket Rate Limiter ──────────────────────────────────────────

// aiRateLimiter enforces per-conversation and per-page rate limits
// for AI auto-replies.  It is safe for concurrent use.
type aiRateLimiter struct {
	mu sync.RWMutex
	// convLast maps conversationID -> last allowed time
	convLast map[string]time.Time
	// pageWindow maps pageID -> []timestamps in the last minute
	pageWindow map[string][]time.Time

	perConvCooldown time.Duration // e.g. 5s
	perPageMax      int           // e.g. 100 per minute
}

func newAIRateLimiter() *aiRateLimiter {
	return &aiRateLimiter{
		convLast:        make(map[string]time.Time),
		pageWindow:      make(map[string][]time.Time),
		perConvCooldown: 5 * time.Second,
		perPageMax:      100,
	}
}

// Allow returns true if both the conversation and page limits are respected.
func (rl *aiRateLimiter) Allow(convID, pageID string) bool {
	now := time.Now()

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// 1. Per-conversation cooldown
	if last, ok := rl.convLast[convID]; ok && now.Sub(last) < rl.perConvCooldown {
		return false
	}

	// 2. Per-page sliding window (last 60s)
	window := rl.pageWindow[pageID]
	cutoff := now.Add(-1 * time.Minute)
	var kept []time.Time
	for _, t := range window {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= rl.perPageMax {
		rl.pageWindow[pageID] = kept
		return false
	}

	// Allow
	rl.convLast[convID] = now
	rl.pageWindow[pageID] = append(kept, now)
	return true
}

// ─── Circuit Breaker ──────────────────────────────────────────────────

// breakerState represents the three states of a circuit breaker.
type breakerState int

const (
	stateClosed breakerState = iota
	stateOpen
	stateHalfOpen
)

// circuitBreaker protects a dependency (e.g. OpenAI) from cascading failures.
type circuitBreaker struct {
	mu            sync.RWMutex
	state         breakerState
	failures      int
	lastFailureAt time.Time

	maxFailures    int           // e.g. 5
	openDuration   time.Duration // e.g. 60s
	halfOpenMax    int           // max probes in half-open (1)
	halfOpenCount  int
}

func newCircuitBreaker() *circuitBreaker {
	return &circuitBreaker{
		maxFailures:  5,
		openDuration: 60 * time.Second,
		halfOpenMax:  1,
	}
}

// Allow returns true when the breaker is closed or half-open and a probe slot
// is available. Call RecordResult after the protected call.
func (cb *circuitBreaker) Allow() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case stateClosed:
		return true
	case stateOpen:
		if time.Since(cb.lastFailureAt) > cb.openDuration {
			cb.state = stateHalfOpen
			cb.halfOpenCount = 0
			return true
		}
		return false
	case stateHalfOpen:
		if cb.halfOpenCount < cb.halfOpenMax {
			cb.halfOpenCount++
			return true
		}
		return false
	}
	return false
}

// RecordResult records the outcome of a protected call.
func (cb *circuitBreaker) RecordResult(success bool) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if success {
		switch cb.state {
		case stateHalfOpen:
			cb.state = stateClosed
			cb.failures = 0
			cb.halfOpenCount = 0
		case stateClosed:
			cb.failures = 0
		}
		return
	}

	cb.lastFailureAt = time.Now()
	cb.failures++

	switch cb.state {
	case stateClosed:
		if cb.failures >= cb.maxFailures {
			cb.state = stateOpen
		}
	case stateHalfOpen:
		cb.state = stateOpen
		cb.halfOpenCount = 0
	}
}

// State returns the current breaker state for observability.
func (cb *circuitBreaker) State() string {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	switch cb.state {
	case stateClosed:
		return "closed"
	case stateOpen:
		return "open"
	case stateHalfOpen:
		return "half-open"
	}
	return "unknown"
}

// MetricsSnapshot returns current internal metrics for /metrics or logs.
func (cb *circuitBreaker) MetricsSnapshot() (state string, failures int) {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	switch cb.state {
	case stateClosed:
		state = "closed"
	case stateOpen:
		state = "open"
	case stateHalfOpen:
		state = "half-open"
	}
	return state, cb.failures
}
