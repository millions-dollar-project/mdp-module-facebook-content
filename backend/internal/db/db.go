// Package db wires up the Postgres connection pool and exposes it to the
// rest of the service. We use pgx/v5's native pool — it is faster and more
// idiomatic than database/sql + lib/pq, and gives us native types
// (timestamptz, jsonb, uuid) without scanning gymnastics.
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool opens a connection pool against the given URL. The pool is
// configured with sensible defaults for a small HTTP service: max 25
// connections, min 2 kept warm, 5-minute lifetime to recycle long-lived
// connections through any pgbouncer / cloud load-balancer in front.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 25
	cfg.MinConns = 2
	cfg.MaxConnLifetime = 5 * time.Minute
	cfg.MaxConnIdleTime = 1 * time.Minute
	cfg.HealthCheckPeriod = 30 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	// Fail fast if the DB is unreachable at startup
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping DB: %w", err)
	}
	return pool, nil
}
