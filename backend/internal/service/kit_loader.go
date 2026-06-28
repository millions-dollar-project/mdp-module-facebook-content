// Package service — kit_loader.go
//
// Phase 6: kit-accounts is the source of truth for FB accounts
// (mdp-kit/go/kit-accounts; on-disk at ~/mdp-data/accounts/<name>/).
// The worker boundary (repost_jobs.account_id, fb_groups.assigned_account_id)
// still holds UUID columns, but the value is the SHA1-v5 of the kit account
// name (see account_uuid.go AccountUUIDFromName).
//
// KitLoader resolves a UUID back to a kit snapshot by:
//   1. enumerating subdirs of the accounts root,
//   2. reading each meta.json,
//   3. recomputing AccountUUIDFromName(name) and matching against the UUID.
//
// LookupAll returns every kit account as a Snapshot. Used to enumerate
// candidates during campaign creation (Phase 6A-5 replaces the old
// accountRepo.List).
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// ErrKitAccountNotFound is returned when no kit account on disk has a
// name that hashes to the requested UUID.
var ErrKitAccountNotFound = errors.New("service: kit account not found for UUID")

// KitAccountSnapshot is the worker's view of a kit account. It carries
// only the fields the worker / handler need to:
//   - decide whether the account is usable (status),
//   - tell the sidecar where to launch the browser (profilePath),
//   - emit audit logs that mention a human-readable name.
//
// All other kit metadata (appstate, cookies, proxy) is read at login
// time by the kit-accounts handler, never by the worker.
type KitAccountSnapshot struct {
	Name        string
	ProfilePath string
	Status      string
	Platform    string
}

// KitLoader is the worker's view of the on-disk account pool at
// ~/mdp-data/accounts/. It exposes just the two queries the worker /
// handler layers need:
//
//   - LookupByUUID — resolve a repost_jobs.account_id (SHA1-v5 of the
//     kit account name) back to the snapshot;
//   - LookupAll    — enumerate every kit account, used during
//     campaign creation when assigning groups.
//
// Tests substitute a fake implementation (see fakeKitLoader in
// repost_worker_test.go) so the worker can be exercised without
// touching disk.
type KitLoader interface {
	LookupByUUID(ctx context.Context, id uuid.UUID) (KitAccountSnapshot, error)
	LookupAll(ctx context.Context) ([]KitAccountSnapshot, error)
	Invalidate()
}

// kitLoader is the production KitLoader: it scans the accounts root on
// first use and caches for 5 s. Safe to share across goroutines.
type kitLoader struct {
	root string

	mu        sync.RWMutex
	cache     map[uuid.UUID]KitAccountSnapshot // keyed by AccountUUIDFromName(name)
	cacheTime time.Time
}

// NewKitLoader returns a KitLoader rooted at the given directory
// (typically ~/mdp-data/accounts). An empty root is tolerated — all
// lookups will return ErrKitAccountNotFound until the directory is
// populated.
func NewKitLoader(root string) KitLoader {
	return &kitLoader{root: root}
}

// Root returns the configured accounts root.
func (k *kitLoader) Root() string { return k.root }

// LookupByUUID returns the snapshot whose name hashes to id. Cache TTL
// is 5 s so a freshly-added kit account is visible quickly without a
// disk hit on every job.
func (k *kitLoader) LookupByUUID(ctx context.Context, id uuid.UUID) (KitAccountSnapshot, error) {
	if err := ctx.Err(); err != nil {
		return KitAccountSnapshot{}, err
	}
	if err := k.refreshIfStale(); err != nil {
		return KitAccountSnapshot{}, err
	}
	k.mu.RLock()
	snap, ok := k.cache[id]
	k.mu.RUnlock()
	if !ok {
		return KitAccountSnapshot{}, fmt.Errorf("%w: %s", ErrKitAccountNotFound, id)
	}
	return snap, nil
}

// LookupAll returns every kit account on disk, regardless of UUID match.
// Used by CreateCampaign to enumerate accounts instead of accountRepo.List.
func (k *kitLoader) LookupAll(ctx context.Context) ([]KitAccountSnapshot, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := k.refreshIfStale(); err != nil {
		return nil, err
	}
	k.mu.RLock()
	out := make([]KitAccountSnapshot, 0, len(k.cache))
	for _, s := range k.cache {
		out = append(out, s)
	}
	k.mu.RUnlock()
	// Stable order for the UI / planning algorithms.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1].Name > out[j].Name; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out, nil
}

// Invalidate drops the cache so the next LookupByUUID rescanfs. Call
// this from kit-delete handlers to avoid stale entries.
func (k *kitLoader) Invalidate() {
	k.mu.Lock()
	k.cache = nil
	k.cacheTime = time.Time{}
	k.mu.Unlock()
}

const kitLoaderCacheTTL = 5 * time.Second

func (k *kitLoader) refreshIfStale() error {
	k.mu.RLock()
	fresh := k.cache != nil && time.Since(k.cacheTime) < kitLoaderCacheTTL
	k.mu.RUnlock()
	if fresh {
		return nil
	}
	return k.refresh()
}

func (k *kitLoader) refresh() error {
	if k.root == "" {
		k.mu.Lock()
		k.cache = map[uuid.UUID]KitAccountSnapshot{}
		k.cacheTime = time.Now()
		k.mu.Unlock()
		return nil
	}
	entries, err := os.ReadDir(k.root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			k.mu.Lock()
			k.cache = map[uuid.UUID]KitAccountSnapshot{}
			k.cacheTime = time.Now()
			k.mu.Unlock()
			return nil
		}
		return fmt.Errorf("kit loader: read root %q: %w", k.root, err)
	}
	next := make(map[uuid.UUID]KitAccountSnapshot, len(entries))
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		name := e.Name()
		metaPath := filepath.Join(k.root, name, "meta.json")
		raw, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}
		var meta struct {
			Name        string `json:"name"`
			Platform    string `json:"platform"`
			Status      string `json:"status"`
			ProfilePath string `json:"profilePath"`
		}
		if err := json.Unmarshal(raw, &meta); err != nil {
			continue
		}
		if meta.Name == "" {
			meta.Name = name
		}
		if meta.ProfilePath == "" {
			meta.ProfilePath = filepath.Join("~", ".mdp", "facebook", "profiles", name)
		}
		if meta.Status == "" {
			meta.Status = "active"
		}
		id := AccountUUIDFromName(meta.Name)
		next[id] = KitAccountSnapshot{
			Name:        meta.Name,
			ProfilePath: meta.ProfilePath,
			Status:      meta.Status,
			Platform:    meta.Platform,
		}
	}
	k.mu.Lock()
	k.cache = next
	k.cacheTime = time.Now()
	k.mu.Unlock()
	return nil
}
