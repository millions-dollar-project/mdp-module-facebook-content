// Package service — account_uuid.go
//
// Phase 5C of the kit-accounts migration: the worker layer (repost_jobs,
// fb_groups) still uses UUID columns to keep schema + sqlc queries
// unchanged. The plugin sends account names (strings) over the wire
// instead of UUIDs, so we need a deterministic UUID for each name.
//
// Strategy: SHA-1 v5 UUID per RFC 4122 §4.3 with a fixed namespace
// (mdp-kit/facebook/v1). The same `name` always maps to the same UUID,
// so:
//
//   - repost_jobs.account_id can store the deterministic UUID and the
//     worker can look up the kit account by name by reversing the mapping;
//   - fb_groups.assigned_account_id can store the same UUID and the UI
//     shows the kit name by reversing the mapping.
//
// The collision risk for SHA-1 in a 160-bit UUID v5 is negligible for the
// realistic number of kit accounts (<10k). v3 (MD5) would also work but
// SHA-1 is what uuid.NewSHA1 exposes.
package service

import (
	"github.com/google/uuid"
)

// kitAccountsFBUUIDNamespace is the RFC4122 namespace UUID used for the
// v5 derivation. It is a *fixed* constant — never derived from env, never
// rotated. Rotating it would silently invalidate every existing
// `repost_jobs.account_id` and `fb_groups.assigned_account_id` row.
//
//   6ba7b810-9dad-11d1-80b4-00c04fd430c8 = uuid.NameSpaceURL
//
// We pick a project-specific variant so we can prove derivation is
// `sha1(namespace || name)` not `sha1(URL || name)`:
//
//   8c3f4a1e-fb2d-4b3e-9c0a-1d2e3f4a5b6c (deterministic, hand-picked)
var kitAccountsFBUUIDNamespace = uuid.MustParse("8c3f4a1e-fb2d-4b3e-9c0a-1d2e3f4a5b6c")

// AccountUUIDFromName returns the deterministic RFC4122 v5 UUID for the
// given kit-account name. Calling with the same name always returns the
// same UUID; different names yield different UUIDs with overwhelming
// probability (160-bit space).
//
// `name` is the kit-accounts directory name (e.g. "acc-001-tai-khoan-1").
// It is the same string the user sees in the UI and what the plugin
// sends to the backend.
func AccountUUIDFromName(name string) uuid.UUID {
	return uuid.NewSHA1(kitAccountsFBUUIDNamespace, []byte(name))
}