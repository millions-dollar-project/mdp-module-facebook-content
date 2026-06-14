#!/usr/bin/env bash
# Manual E2E smoke test for the "Thu thập bài viết" date filter.
#
# Boots the sidecar, hits POST /crawl with `untilDate` and prints the
# raw response. Use this to verify the new "drop-newer / walk-backward"
# semantic against a real Facebook page.
#
# Usage:
#   ./scripts/crawl-e2e.sh <pageUrl> [untilDate] [limit]
#
# Examples:
#   # Crawl 4 posts on or before 12/06/2026 (today, in VN TZ)
#   ./scripts/crawl-e2e.sh https://www.facebook.com/somepage 2026-06-12 4
#
#   # Crawl 10 posts without date filter (caller = all-time)
#   ./scripts/crawl-e2e.sh https://www.facebook.com/somepage "" 10
#
# Sidecar defaults to :9001; backend defaults to :8081.

set -euo pipefail

PAGE_URL="${1:-https://www.facebook.com/thietketruongmamnonecohome}"
UNTIL_DATE="${2:-2026-06-12}"
LIMIT="${3:-4}"
SIDECAR_URL="http://127.0.0.1:9001"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  if [[ -n "${SIDECAR_PID:-}" ]] && kill -0 "$SIDECAR_PID" 2>/dev/null; then
    echo "[e2e] stopping sidecar (pid $SIDECAR_PID)…"
    kill "$SIDECAR_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[e2e] starting sidecar on :9001…"
(
  cd "$REPO_ROOT/sidecar"
  node src/index.js
) &
SIDECAR_PID=$!

# Wait for sidecar /health to come up (max 10s)
for i in {1..20}; do
  if curl -fsS "$SIDECAR_URL/health" >/dev/null 2>&1; then
    echo "[e2e] sidecar is up"
    break
  fi
  sleep 0.5
done

if ! curl -fsS "$SIDECAR_URL/health" >/dev/null 2>&1; then
  echo "[e2e] sidecar failed to start within 10s" >&2
  exit 1
fi

PAYLOAD=$(printf '{"pageUrl":"%s","limit":%d,"untilDate":"%s"}' \
  "$PAGE_URL" "$LIMIT" "$UNTIL_DATE")

echo "[e2e] POST /crawl  pageUrl=$PAGE_URL  untilDate=$UNTIL_DATE  limit=$LIMIT"
echo "----- response -----"
RESP=$(curl -fsS -X POST "$SIDECAR_URL/crawl" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
echo "$RESP" | node -e '
  const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!j.success) {
    console.error("FAIL:", j.error);
    process.exit(1);
  }
  console.log("Got", j.posts.length, "posts (sorted newest-first):");
  for (const p of j.posts) {
    const d = new Date(p.postedAt);
    const tag = isNaN(d.getTime()) ? "unparseable" : d.toISOString();
    const preview = (p.content || "").slice(0, 60).replace(/\n/g, " ");
    console.log("  -", tag, "  ", preview);
  }
'
echo "----- end response -----"
