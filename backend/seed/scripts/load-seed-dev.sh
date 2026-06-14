#!/usr/bin/env bash
# load-seed-dev.sh — bootstrap a fresh dev DB with the seed data.
#
# Reads FB_PAGE_ACCESS_TOKEN from the environment (or .env), substitutes
# the placeholder in seed-dev.sql, and pipes the result to psql.
#
# Idempotent: re-running is a no-op (ON CONFLICT DO NOTHING).

set -euo pipefail

# ─── Resolve repo-relative paths regardless of CWD ─────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SEED_FILE="$SEED_DIR/seed-dev.sql"

if [ ! -f "$SEED_FILE" ]; then
    echo "error: seed file not found: $SEED_FILE" >&2
    exit 1
fi

# ─── Load .env if present (FOUNDATION_LIGHT) ───────────────────────────────
if [ -z "${FB_PAGE_ACCESS_TOKEN:-}" ] && [ -f "$SEED_DIR/../.env" ]; then
    # shellcheck disable=SC1091
    set -a
    . "$SEED_DIR/../.env"
    set +a
fi

if [ -z "${FB_PAGE_ACCESS_TOKEN:-}" ]; then
    echo "error: FB_PAGE_ACCESS_TOKEN is not set." >&2
    echo "  export FB_PAGE_ACCESS_TOKEN=\"EAA...\"" >&2
    echo "  or put it in backend/.env" >&2
    exit 1
fi

# ─── Resolve DATABASE_URL (default = local docker postgres on 5433) ───────
if [ -z "${DATABASE_URL:-}" ]; then
    if [ -f "$SEED_DIR/../.env" ]; then
        # shellcheck disable=SC1091
        set -a
        . "$SEED_DIR/../.env"
        set +a
    fi
fi
if [ -z "${DATABASE_URL:-}" ]; then
    DATABASE_URL="postgres://facebook:facebook@localhost:5433/facebook?sslmode=disable"
    echo "info: DATABASE_URL not set, using default: $DATABASE_URL" >&2
fi

# ─── Substitute placeholder, pipe to psql ─────────────────────────────────
# Using sed here (not psql -v) because the token may contain characters
# psql variable substitution treats specially ($, ', etc).
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
sed "s|__SEED_PAGE_ACCESS_TOKEN__|${FB_PAGE_ACCESS_TOKEN}|g" "$SEED_FILE" > "$TMP"

echo "loading seed into $DATABASE_URL ..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$TMP"

echo "done."
