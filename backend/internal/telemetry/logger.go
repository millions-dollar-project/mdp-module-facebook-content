// Package telemetry provides structured logging via log/slog (stdlib).
package telemetry

import (
	"log/slog"
	"os"
	"strings"
)

// NewLogger returns a JSON slog logger writing to stderr at the given level.
// level should be one of: "debug", "info", "warn", "error" (case-insensitive).
// Defaults to info when empty or unrecognised.
func NewLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	h := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: lvl})
	return slog.New(h)
}
