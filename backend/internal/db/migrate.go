// Migration runner. We use the `file://` source driver against the
// migrations/ directory embedded in the binary via go:embed. The
// database name is taken from the DATABASE_URL; the schema_migrations
// table is created by golang-migrate on first run.
package db

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// recoverDirty clears the golang-migrate dirty flag after a failed or
// interrupted migration. Without this, every subsequent boot aborts with
// "Dirty database version N" and the user has to drop the schema by
// hand.
//
// Strategy:
//
// golang-migrate refuses to do ANYTHING while dirty=true except Force().
// So step 1 is always to clear the flag. We pick the destination by
// probing Postgres for every migration up to and including the dirty
// one — if its first CREATE TABLE exists, we mark it as applied; if not,
// we stop there. The destination is the highest version whose schema is
// present. Anything missing gets re-applied by Up().
func recoverDirty(m *migrate.Migrate, logger *slog.Logger, databaseURL string) error {
	curVer, dirty, err := m.Version()
	if err != nil && !errors.Is(err, migrate.ErrNilVersion) {
		return fmt.Errorf("read migration version: %w", err)
	}
	if !dirty {
		return nil
	}
	logger.Warn("migration dirty — attempting auto-recovery", "dirty_version", curVer)

	// Scan the FULL migration set, not just up to the dirty version —
	// the schema in the DB may have outrun the dirty marker (e.g. all
	// 30 tables exist but schema_migrations is stuck at v4 dirty=true
	// because an earlier crash happened during Up()). Limiting the
	// scan to curVer would under-recover and re-run migrations whose
	// objects are already present.
	maxApplied := highestAppliedVersion(totalMigrationCount(), databaseURL, logger)
	target := maxApplied
	logger.Warn("dirty probe summary",
		"dirty_version", curVer, "highest_applied", maxApplied)
	if target > int(curVer) {
		// The schema outran the dirty marker — accept the higher value.
		// This is the exact case the expanded scan is meant to fix.
	}
	if err := m.Force(target); err != nil {
		return fmt.Errorf("force version %d (clear dirty): %w", target, err)
	}
	logger.Info("dirty flag cleared", "forced_to", target)
	return nil
}

// schemaAlreadyApplied returns true when the migration at the given
// version appears to have committed before the crash. Reads the .up.sql
// file and probes Postgres for the first CREATE TABLE or CREATE SCHEMA
// it finds. Migrations with neither (ALTERs, seed rows only) are
// treated as "always applied" — they leave nothing to probe. False
// positives are rare (migrations are append-only); false negatives fall
// through to a normal re-run which is the safe default.
func schemaAlreadyApplied(version uint, databaseURL string, logger *slog.Logger) bool {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		logger.Warn("dirty probe: read migrations failed", "err", err)
		return false
	}
	target := fmt.Sprintf("%03d_", version)
	var body []byte
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), target) && strings.HasSuffix(e.Name(), ".up.sql") {
			body, err = migrationsFS.ReadFile("migrations/" + e.Name())
			if err != nil {
				logger.Warn("dirty probe: read file failed", "name", e.Name(), "err", err)
				return false
			}
			break
		}
	}
	if body == nil {
		logger.Warn("dirty probe: no matching migration file", "version", version)
		return false
	}
	// Look for CREATE TABLE first.
	tableRe := regexp.MustCompile(`(?is)create\s+table\s+(?:if\s+not\s+exists\s+)?(?:["\w]+\.)?["\w]*"?\s*["\w]*"?\.([A-Za-z_][\w]*)`)
	if m := tableRe.FindSubmatch(body); m != nil {
		tableName := strings.ToLower(string(m[1]))
		if !pgTableExists(databaseURL, tableName) {
			logger.Warn("dirty probe result", "version", version, "table", tableName, "exists", false)
			return false
		}
		// Table exists — but the migration may have added more than one
		// object. If the migration also declares a CREATE INDEX, require
		// the first one to exist too. That guards against partial state
		// (someone wiped columns but kept the table) without forcing us
		// to parse the entire DDL.
		indexRe := regexp.MustCompile(`(?is)create\s+index\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][\w]*)`)
		if im := indexRe.FindSubmatch(body); im != nil {
			indexName := strings.ToLower(string(im[1]))
			indexExists := pgIndexExists(databaseURL, indexName)
			logger.Warn("dirty probe result",
				"version", version, "table", tableName, "index", indexName,
				"table_exists", true, "index_exists", indexExists)
			return indexExists
		}
		logger.Warn("dirty probe result", "version", version, "table", tableName, "exists", true)
		return true
	}
	// Fall back to CREATE SCHEMA.
	schemaRe := regexp.MustCompile(`(?is)create\s+schema\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][\w]*)`)
	if m := schemaRe.FindSubmatch(body); m != nil {
		schemaName := strings.ToLower(string(m[1]))
		exists := pgSchemaExists(databaseURL, schemaName)
		logger.Warn("dirty probe result", "version", version, "schema", schemaName, "exists", exists)
		return exists
	}
	logger.Warn("dirty probe: no CREATE TABLE/SCHEMA — assuming applied", "version", version)
	return true
}

// totalMigrationCount returns the number of *.up.sql files embedded in
// the binary. Used by recoverDirty to scan the FULL migration set when
// the DB schema has outrun the schema_migrations version row.
func totalMigrationCount() int {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".up.sql") {
			count++
		}
	}
	return count
}

// highestAppliedVersion scans migrations 1..maxDirty and returns the
// highest version whose first CREATE TABLE is present in Postgres. -1
// means no migrations are applied yet (clean slate).
func highestAppliedVersion(maxDirty int, databaseURL string, logger *slog.Logger) int {
	highest := -1
	for v := 1; v <= maxDirty; v++ {
		if schemaAlreadyApplied(uint(v), databaseURL, logger) {
			highest = v
		} else {
			logger.Warn("dirty probe: stopping scan — migration not applied",
				"version", v, "highest_so_far", highest)
			break
		}
	}
	return highest
}

// pgTableExists uses a short-lived pgx connection to check
// information_schema. Runs once per boot when dirty.
func pgTableExists(databaseURL, tableName string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return false
	}
	defer conn.Close(ctx)
	var exists bool
	err = conn.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE lower(table_name) = $1
		)`, tableName).Scan(&exists)
	if err != nil {
		return false
	}
	return exists
}

// pgSchemaExists mirrors pgTableExists but for namespaces. Used to
// recover from a dirty migration that only declared CREATE SCHEMA.
func pgSchemaExists(databaseURL, schemaName string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return false
	}
	defer conn.Close(ctx)
	var exists bool
	err = conn.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.schemata
			WHERE lower(schema_name) = $1
		)`, schemaName).Scan(&exists)
	if err != nil {
		return false
	}
	return exists
}

// pgIndexExists reports whether a given index name is present. Used as
// a tie-breaker when CREATE TABLE alone is too weak a signal (the table
// could exist with a partial schema). Matches indexes on any table.
func pgIndexExists(databaseURL, indexName string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return false
	}
	defer conn.Close(ctx)
	var exists bool
	err = conn.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM pg_indexes
			WHERE lower(indexname) = $1
		)`, indexName).Scan(&exists)
	if err != nil {
		return false
	}
	return exists
}

// RunMigrationsUp applies all up migrations and returns. If the DB is
// already at the latest version, ErrNoChange is returned and treated as
// success. A previously-crashed migration (dirty flag) is auto-recovered
// before running so a single bad boot doesn't brick the backend.
//
// Cross-module note: this backend shares a Postgres database with
// mdp-module-facebook (legacy). Both write to the `schema_migrations`
// table; the legacy module owns the higher-numbered migrations. When
// the DB has already been advanced past our local set (e.g. legacy
// ran first and left version=30 while we only ship 25 files),
// golang-migrate's `Up()` aborts with "no migration found for version
// N" — a false negative. We detect that case and short-circuit.
func RunMigrationsUp(databaseURL string, logger *slog.Logger) error {
	if logger == nil {
		logger = slog.Default()
	}
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("load migration source: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, databaseURL)
	if err != nil {
		return fmt.Errorf("open migrate: %w", err)
	}
	defer m.Close()
	if err := recoverDirty(m, logger, databaseURL); err != nil {
		return err
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		// Cross-DB overshoot: another module already advanced
		// schema_migrations past our highest version. Nothing for us to
		// do — log and succeed so the backend still boots.
		if strings.Contains(err.Error(), "no migration found for version") {
			if logger != nil {
				logger.Warn("schema_migrations beyond local migration set; skipping",
					"err", err.Error())
			}
			return nil
		}
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}

// RunMigrationsDown reverses all migrations. Used by `make migrate-down`.
// Not called from production code.
func RunMigrationsDown(databaseURL string, logger *slog.Logger) error {
	if logger == nil {
		logger = slog.Default()
	}
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("load migration source: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, databaseURL)
	if err != nil {
		return fmt.Errorf("open migrate: %w", err)
	}
	defer m.Close()
	if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate down: %w", err)
	}
	_ = logger // reserved for future recovery in Down path
	return nil
}
