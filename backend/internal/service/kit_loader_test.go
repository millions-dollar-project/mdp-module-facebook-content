package service

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
)

// writeMeta drops a minimal meta.json in <root>/<name>/ so the loader can
// discover the kit account. Tests should call this for each fixture
// before invoking the loader.
func writeMeta(t *testing.T, root, name, status, profilePath string) uuid.UUID {
	t.Helper()
	dir := filepath.Join(root, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	meta := map[string]any{
		"name":        name,
		"platform":    "facebook",
		"status":      status,
		"profilePath": profilePath,
	}
	raw, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "meta.json"), raw, 0o644); err != nil {
		t.Fatalf("write meta: %v", err)
	}
	return AccountUUIDFromName(name)
}

func TestKitLoader_LookupByUUID_Hit(t *testing.T) {
	root := t.TempDir()
	id := writeMeta(t, root, "acc-test-001", "active", "/tmp/p1")

	k := NewKitLoader(root)
	got, err := k.LookupByUUID(context.Background(), id)
	if err != nil {
		t.Fatalf("LookupByUUID: %v", err)
	}
	if got.Name != "acc-test-001" {
		t.Fatalf("Name = %q, want acc-test-001", got.Name)
	}
	if got.Status != "active" {
		t.Fatalf("Status = %q, want active", got.Status)
	}
	if got.ProfilePath != "/tmp/p1" {
		t.Fatalf("ProfilePath = %q, want /tmp/p1", got.ProfilePath)
	}
	if got.Platform != "facebook" {
		t.Fatalf("Platform = %q, want facebook", got.Platform)
	}
}

func TestKitLoader_LookupByUUID_Miss(t *testing.T) {
	root := t.TempDir()
	writeMeta(t, root, "acc-001", "active", "/tmp/p1")

	k := NewKitLoader(root)
	_, err := k.LookupByUUID(context.Background(), uuid.New())
	if err == nil {
		t.Fatalf("expected ErrKitAccountNotFound, got nil")
	}
}

func TestKitLoader_LookupAll_Sorted(t *testing.T) {
	root := t.TempDir()
	writeMeta(t, root, "charlie", "active", "/tmp/c")
	writeMeta(t, root, "alpha", "active", "/tmp/a")
	writeMeta(t, root, "bravo", "inactive", "/tmp/b")

	k := NewKitLoader(root)
	got, err := k.LookupAll(context.Background())
	if err != nil {
		t.Fatalf("LookupAll: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	want := []string{"alpha", "bravo", "charlie"}
	for i, g := range got {
		if g.Name != want[i] {
			t.Fatalf("got[%d].Name = %q, want %q", i, g.Name, want[i])
		}
	}
}

func TestKitLoader_EmptyRoot(t *testing.T) {
	root := t.TempDir()
	k := NewKitLoader(root)
	got, err := k.LookupAll(context.Background())
	if err != nil {
		t.Fatalf("LookupAll on empty root: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("len = %d, want 0", len(got))
	}
}

func TestKitLoader_MissingRoot(t *testing.T) {
	k := NewKitLoader("Z:/this/does/not/exist")
	got, err := k.LookupAll(context.Background())
	if err != nil {
		t.Fatalf("LookupAll on missing root: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("len = %d, want 0", len(got))
	}
}

func TestKitLoader_DefaultProfilePath(t *testing.T) {
	root := t.TempDir()
	id := writeMeta(t, root, "acc-no-profile", "active", "")

	k := NewKitLoader(root)
	got, err := k.LookupByUUID(context.Background(), id)
	if err != nil {
		t.Fatalf("LookupByUUID: %v", err)
	}
	if got.ProfilePath == "" {
		t.Fatalf("ProfilePath empty, want default")
	}
	if filepath.Base(got.ProfilePath) != "acc-no-profile" {
		t.Fatalf("default ProfilePath base = %q, want acc-no-profile", filepath.Base(got.ProfilePath))
	}
}

func TestKitLoader_Invalidate_Rerescanfs(t *testing.T) {
	root := t.TempDir()
	k := NewKitLoader(root)
	if _, err := k.LookupAll(context.Background()); err != nil {
		t.Fatalf("LookupAll empty: %v", err)
	}
	writeMeta(t, root, "late-account", "active", "/tmp/late")
	// Without invalidating, the cache may still serve 0 entries.
	k.Invalidate()
	got, err := k.LookupAll(context.Background())
	if err != nil {
		t.Fatalf("LookupAll post-invalidate: %v", err)
	}
	if len(got) != 1 || got[0].Name != "late-account" {
		t.Fatalf("got = %+v, want exactly [late-account]", got)
	}
}
