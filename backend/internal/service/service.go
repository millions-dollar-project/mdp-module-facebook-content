// Package service holds the business logic. Handlers should be thin
// (parse, validate, return); everything that involves multiple repos,
// external API calls, or non-trivial validation lives here.
package service

import (
	"context"
	"log/slog"
)

// ctxAlias is a tiny alias kept for future use when service files need
// to import context indirectly. Currently unused but referenced from
// godoc on the package.
type ctxAlias = context.Context

// Deps bundles the dependencies that service-level functions need.
// Kept around for future use (e.g. when a service wants the logger
// without it being a constructor arg). Today constructors take the
// individual repos/clients directly; Deps is here so we don't have to
// refactor everything when Phase 3 needs cross-cutting logging.
type Deps struct {
	Logger *slog.Logger
}
