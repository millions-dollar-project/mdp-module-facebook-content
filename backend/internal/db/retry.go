package db

import (
	"context"
	"errors"
	"net"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// IsTransient returns true for errors that are likely to succeed on retry
// (network hiccups, temporary unavailability, context deadline exceeded).
func IsTransient(err error) bool {
	if err == nil {
		return false
	}
	// Context cancellation is NOT transient — the caller gave up.
	if errors.Is(err, context.Canceled) {
		return false
	}
	// Deadline exceeded might be transient if the DB was briefly overloaded.
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	// PgError with CLASS 08 (connection exception) or 40 (transaction rollback)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.SQLState()[:2] {
		case "08", "40", "53", "55": // connection, tx rollback, insufficient resources, object not in prerequisite state
			return true
		}
	}
	// Pgx generic connection errors
	if errors.Is(err, pgx.ErrTxClosed) {
		return true
	}
	// Network-level timeouts / temp errors
	var netErr net.Error
	if errors.As(err, &netErr) {
		return netErr.Timeout() || netErr.Temporary()
	}
	return false
}

// Retry calls fn up to maxAttempts times with exponential backoff.
// It stops retrying when fn returns nil, ctx is done, or the error is not transient.
func Retry(ctx context.Context, maxAttempts int, initialBackoff time.Duration, fn func() error) error {
	var err error
	backoff := initialBackoff
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err = fn()
		if err == nil {
			return nil
		}
		if !IsTransient(err) {
			return err
		}
		if attempt == maxAttempts {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
		if backoff < 5*time.Second {
			backoff *= 2
		}
	}
	return err
}
