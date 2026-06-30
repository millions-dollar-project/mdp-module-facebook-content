// Command backfill-account-scope stamps an account_id onto graph
// entities that were ingested before the per-account scoping fix.
//
// Context: prior to the fix, mdp-brain's brain_ingest_raw_input tool
// had no AccountID field, so every fresh ingest landed under scope =
// {user_id:"default"} with no account_id. mdp-brain's
// brainQueryGraph, meanwhile, applies scope @> filters — so per-account
// dashboard queries return zero rows for any account scope. This
// script back-fills the missing account_id onto historical rows
// belonging to one kit-account (today only acc-001 exists; multi-account
// back-fill can be added by passing --scope-account or similar).
//
// Usage:
//
//	BRAIN_DSN=... ACCOUNT_UUID=... go run ./cmd/backfill-account-scope
//	DRY_RUN=1 ACCOUNT_UUID=... go run ./cmd/backfill-account-scope   # count only
//
// Defaults: BRAIN_DSN=postgres://brain:brain@localhost:5434/brain?sslmode=disable
//
// We use jsonb concatenation (`scope || jsonb_build_object(...)`) so
// we don't clobber any other keys already in scope — current rows only
// carry user_id, but be safe in case someone else added keys.
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	dsn := os.Getenv("BRAIN_DSN")
	if dsn == "" {
		dsn = "postgres://brain:brain@localhost:5434/brain?sslmode=disable"
	}
	accountID := os.Getenv("ACCOUNT_UUID")
	if accountID == "" {
		fmt.Fprintln(os.Stderr, "ACCOUNT_UUID required")
		os.Exit(2)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Fprintln(os.Stderr, "connect:", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	// Count rows that match: legacy {user_id:"default"} scope, no account_id.
	var toUpdate int
	err = conn.QueryRow(ctx, `
		SELECT count(*) FROM graph_entities
		WHERE scope @> '{"user_id":"default"}'::jsonb
		  AND (scope->>'account_id') IS NULL
	`).Scan(&toUpdate)
	if err != nil {
		fmt.Fprintln(os.Stderr, "count:", err)
		os.Exit(1)
	}
	fmt.Printf("Rows to back-fill: %d (account_id=%s)\n", toUpdate, accountID)

	if os.Getenv("DRY_RUN") == "1" || os.Getenv("DRY_RUN") == "true" {
		fmt.Println("DRY_RUN set — not modifying.")
		return
	}

	// Apply: scope = scope || jsonb_build_object('account_id', $1).
	tag, err := conn.Exec(ctx, `
		UPDATE graph_entities
		SET scope = scope || jsonb_build_object('account_id', $1::text)
		WHERE scope @> '{"user_id":"default"}'::jsonb
		  AND (scope->>'account_id') IS NULL
	`, accountID)
	if err != nil {
		fmt.Fprintln(os.Stderr, "update:", err)
		os.Exit(1)
	}
	fmt.Printf("Updated %d rows.\n", tag.RowsAffected())
}