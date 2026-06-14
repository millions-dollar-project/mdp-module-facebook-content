// Package testutil provides shared test infrastructure: a testcontainers
// Postgres + migrations + a way to clean rows between tests.
package testutil

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql postgres driver
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// DB is a handle for tests: the pool plus a *sql.DB for golang-migrate
// (which doesn't speak pgx natively). Use Cleanup(t) to terminate the
// container when the test ends.
type DB struct {
	Pool      *pgxpool.Pool
	SQL       *sql.DB
	Container testcontainers.Container
}

// NewPostgres spins up a Postgres 16 container, applies our migrations,
// and returns a ready-to-use *DB. The container is cleaned up via
// t.Cleanup. If Docker is not available the test is skipped.
func NewPostgres(t *testing.T) *DB {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pgC, err := tcpostgres.RunContainer(ctx,
		testcontainers.WithImage("postgres:16-alpine"),
		tcpostgres.WithDatabase("facebook_test"),
		tcpostgres.WithUsername("test"),
		tcpostgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Skipf("testcontainers: cannot start postgres (likely no Docker): %v", err)
	}

	dsn, err := pgC.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("get dsn: %v", err)
	}
	// Apply migrations
	if err := runMigrationsFromTestDir(dsn); err != nil {
		t.Fatalf("migrations: %v", err)
	}

	// pgx pool
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool.New: %v", err)
	}
	// stdlib *sql.DB for golang-migrate.
	// pgx/v5/stdlib registers as driver "pgx" (not "postgres").
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	db := &DB{Pool: pool, SQL: sqlDB, Container: pgC}
	t.Cleanup(func() { db.Close() })
	return db
}

// Close terminates the container and closes both pool and DB. Safe to
// call multiple times.
func (d *DB) Close() {
	if d == nil {
		return
	}
	if d.Pool != nil {
		d.Pool.Close()
	}
	if d.SQL != nil {
		_ = d.SQL.Close()
	}
	if d.Container != nil {
		_ = d.Container.Terminate(context.Background())
	}
}

// runMigrationsFromTestDir uses the same migrations/ directory the
// production code does. We resolve the path relative to this test
// helper so the helper works regardless of CWD.
func runMigrationsFromTestDir(dsn string) error {
	// testutil/db.go lives at
	//   <workspace>/mdp-module-facebook/backend/testutil/db.go
	// Going up 3 levels lands at the workspace root; the migrations
	// are then under mdp-module-facebook/backend/internal/db/migrations.
	_, thisFile, _, _ := runtime.Caller(0)
	workspace := filepath.Join(filepath.Dir(thisFile), "..", "..", "..")
	migDir := filepath.Join(workspace, "mdp-module-facebook", "backend", "internal", "db", "migrations")
	if _, err := os.Stat(migDir); err != nil {
		return fmt.Errorf("migrations dir not found at %s: %w", migDir, err)
	}
	// We hand-roll the up-loop here rather than calling
	// db.RunMigrationsUp so the test doesn't need to import the main
	// package's embed (which would create an import cycle in some
	// test layouts).
	return applyMigrationsManually(dsn, migDir)
}

// applyMigrationsManually runs the up SQL files in lexical order. The
// production path uses golang-migrate + embed; this duplicate keeps
// the test helper self-contained.
func applyMigrationsManually(dsn, dir string) error {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	files, err := filepath.Glob(filepath.Join(dir, "*.up.sql"))
	if err != nil {
		return err
	}
	// Lexical sort = 001, 002, …, 006
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			return err
		}
		if _, err := db.Exec(string(b)); err != nil {
			return fmt.Errorf("apply %s: %w", filepath.Base(f), err)
		}
	}
	return nil
}
