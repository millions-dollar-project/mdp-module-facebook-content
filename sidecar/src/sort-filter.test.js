/**
 * Tests for filterAndLimitPosts.
 *
 * Run with: `pnpm test` (or `pnpm exec vitest run`).
 * Uses vitest's globals (describe/it/expect) to stay CJS-friendly — see
 * vitest.config.js.
 */
const { filterAndLimitPosts } = require("./sort-filter");

const mk = (id, postedAt) => ({ id, postedAt });

describe("filterAndLimitPosts", () => {
  it("sorts newest-first regardless of input order", () => {
    const t1 = new Date("2026-06-11T09:00:00Z");
    const t2 = new Date("2026-06-10T09:00:00Z");
    const t3 = new Date("2026-06-09T09:00:00Z");
    const out = filterAndLimitPosts(
      [mk("mid", t2), mk("old", t3), mk("new", t1)],
      10,
      null,
    );
    expect(out.map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("applies limit after sort", () => {
    const base = new Date("2026-06-11T09:00:00Z");
    const in10 = Array.from({ length: 10 }, (_, i) =>
      mk(String.fromCharCode(97 + i), new Date(base.getTime() - i * 3600_000)),
    );
    const out = filterAndLimitPosts(in10, 3, null);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("respects untilDate (drops posts newer than the cutoff, keeps older)", () => {
    // "Từ ngày = 2026-06-10" → keep posts posted on or before 2026-06-10
    // (so d09 and d10 are kept, d11 is dropped). Sidecar receives the
    // exclusive end-of-day from Go, but in this unit test we pass the
    // value directly to verify the comparison itself.
    const d9 = new Date("2026-06-09T12:00:00Z");
    const d10 = new Date("2026-06-10T12:00:00Z");
    const d11 = new Date("2026-06-11T12:00:00Z");
    const out = filterAndLimitPosts(
      [mk("d09", d9), mk("d10", d10), mk("d11", d11)],
      10,
      new Date("2026-06-10T12:00:00Z"),
    );
    expect(out.map((p) => p.id)).toEqual(["d10", "d09"]);
  });

  it("respects untilDate as exclusive end-of-day (matches Go parseUntilDate +1d)", () => {
    // Real call from Go: parseUntilDate("2026-06-10") in Asia/Ho_Chi_Minh
    // returns 2026-06-11T00:00:00+07:00 = 2026-06-10T17:00:00Z.
    // Posts at 23:59 local on 10/06 (= 16:59Z) must be kept.
    const untilFromGo = new Date("2026-06-10T17:00:00Z"); // = 11/06 00:00 +07
    const postOnCutoffDay = new Date("2026-06-10T16:59:00Z");
    const postDayBefore = new Date("2026-06-09T23:00:00Z");
    const postDayAfter = new Date("2026-06-10T17:00:01Z");
    const out = filterAndLimitPosts(
      [
        mk("after", postDayAfter),
        mk("onDay", postOnCutoffDay),
        mk("before", postDayBefore),
      ],
      10,
      untilFromGo,
    );
    expect(out.map((p) => p.id)).toEqual(["onDay", "before"]);
  });

  it("keeps posts with unparseable postedAt (never silently lose data)", () => {
    const d10 = new Date("2026-06-10T12:00:00Z");
    const out = filterAndLimitPosts(
      [mk("d10", d10), mk("d11", "not-a-date")],
      10,
      new Date("2026-06-10T12:00:00Z"),
    );
    // d10 kept (equal to cutoff), d11 sinks to end (unparseable)
    expect(out.map((p) => p.id)).toEqual(["d10", "d11"]);
  });

  it("returns empty for empty input without error", () => {
    expect(filterAndLimitPosts([], 10, null)).toEqual([]);
    expect(filterAndLimitPosts(null, 10, null)).toEqual([]);
  });
});
