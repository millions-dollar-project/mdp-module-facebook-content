/**
 * Pure post-processing helper for scrapePage.
 *
 * Why a separate module: the filter/sort/limit logic has no Playwright
 * dependency, so it can be unit-tested without spinning up a browser
 * and without leaking the browser context into tests.
 *
 * Semantics — match the Go side (FilterAndLimitCrawledPosts) and the
 * user's spec ("Từ ngày = 12/06/2026 → lùi về cũ hơn lấy đủ số
 * lượng cần crawl"): crawl starts at `until` and walks backward in
 * time.
 *
 *   1. Drop posts newer than `until` (null/undefined = no upper bound).
 *      Sidecar receives `until` as the *exclusive* end-of-day in the
 *      caller's local timezone (Go parseUntilDate adds +1 day), so
 *      `postedAt <= until` keeps every post on or before the chosen
 *      day in local time.
 *   2. Sort the rest newest-first by postedAt.
 *   3. Take the first `limit` posts. limit <= 0 = no upper bound.
 *
 * Posts whose postedAt is unparseable sink to the end of the sorted
 * slice but are never dropped (we never silently lose data).
 *
 * @param {Array<object>} posts  Raw posts from scrapePage. Each must have
 *                               a postedAt (Date or ISO string) and any
 *                               other shape fields the caller cares about.
 * @param {number} limit         Max number of posts to return.
 * @param {Date|string|null} until  Drop posts with postedAt > this.
 * @returns {Array<object>}      Filtered + sorted + sliced posts.
 */
function filterAndLimitPosts(posts, limit, until) {
  if (!Array.isArray(posts) || posts.length === 0) return [];

  const untilMs = toMs(until);

  const filtered = posts.filter((p) => {
    if (untilMs === null) return true;
    const t = toMs(p && p.postedAt);
    if (t === null) return true; // keep unparseable dates
    return t <= untilMs;
  });

  filtered.sort((a, b) => {
    const ta = toMs(a && a.postedAt);
    const tb = toMs(b && b.postedAt);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1; // a sinks
    if (tb === null) return -1; // b sinks
    return tb - ta; // newest first
  });

  if (limit > 0 && filtered.length > limit) {
    return filtered.slice(0, limit);
  }
  return filtered;
}

function toMs(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

module.exports = { filterAndLimitPosts };
