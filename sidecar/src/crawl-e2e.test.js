/**
 * End-to-end-ish test for the /crawl HTTP route.
 *
 * Why E2E-ish instead of a pure unit test: the bug we're guarding
 * against (chain break between Go and sidecar) lives in the wiring
 * between (a) the HTTP body parser, (b) the destructure of
 * `untilDate`, and (c) the call into `scrapePage`. Each piece has its
 * own unit test, but a regression where one of them forgets to pass
 * `untilDate` through would only surface in a test that runs the
 * actual route handler. We don't need a real browser — the
 * `scrapePage` dependency is stubbed out via Node's require cache
 * before index.js is loaded.
 *
 * What this test verifies:
 *   1. POST /crawl with `untilDate` propagates the value to
 *      scrapePage.
 *   2. Posts newer than `untilDate` are filtered out by the
 *      filterAndLimitPosts that scrapePage calls.
 *   3. POST /crawl with no `untilDate` leaves all posts.
 *   4. The route returns 400 when pageUrl is missing.
 *
 * Run with: pnpm test
 */
const path = require("path");
const http = require("http");

const SCRAPER_PATH = require.resolve("./scraper");
const INDEX_PATH = require.resolve("./index");

function bootSidecar(stubScrapePage) {
  // Replace the scraper module's exports BEFORE requiring index.js.
  // index.js does `const { scrapePage } = require("./scraper")` at
  // module load, so as long as our stub is in place first, the
  // destructured binding will pick it up.
  const realScraper = require(SCRAPER_PATH);
  require.cache[SCRAPER_PATH] = {
    id: SCRAPER_PATH,
    filename: SCRAPER_PATH,
    loaded: true,
    exports: { ...realScraper, scrapePage: stubScrapePage },
  };
  // Clear index.js from cache so it re-evaluates with the stubbed
  // scraper. The previous run (if any) cached the real scraper ref.
  delete require.cache[INDEX_PATH];
  // index.js calls app.listen() with PORT=process.env.SIDECAR_PORT||9001
  // — pick a random port to avoid clashing with a real sidecar.
  const port = 19000 + Math.floor(Math.random() * 1000);
  process.env.SIDECAR_PORT = String(port);
  require(INDEX_PATH);
  return new Promise((resolve) => {
    // give app.listen() one tick to bind
    setImmediate(() => resolve(port));
  });
}

function postJson(port, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: pathname,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = { _raw: text };
          }
          resolve({ status: res.statusCode, body: json });
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

describe("POST /crawl E2E (untilDate propagation)", () => {
  it("passes untilDate from HTTP body to scrapePage", async () => {
    const captured = { untilDate: undefined };
    const stub = async (_url, opts) => {
      captured.untilDate = opts.untilDate;
      return [];
    };
    const port = await bootSidecar(stub);
    const r = await postJson(port, "/crawl", {
      pageUrl: "https://www.facebook.com/somepage",
      limit: 4,
      untilDate: "2026-06-12T17:00:00.000Z",
    });
    expect(r.status).toBe(200);
    expect(captured.untilDate).toBe("2026-06-12T17:00:00.000Z");
  });

  it("omits untilDate when caller doesn't send it", async () => {
    const captured = { untilDate: "sentinel-not-overwritten" };
    const stub = async (_url, opts) => {
      captured.untilDate = opts.untilDate;
      return [];
    };
    const port = await bootSidecar(stub);
    const r = await postJson(port, "/crawl", {
      pageUrl: "https://www.facebook.com/somepage",
      limit: 4,
    });
    expect(r.status).toBe(200);
    expect(captured.untilDate).toBeNull();
  });

  it("filters out posts newer than untilDate (drop-newer semantic)", async () => {
    // Until = 2026-06-12T17:00:00Z (= 13/06 00:00 +07, exclusive end of 12/06 local)
    const until = "2026-06-12T17:00:00.000Z";
    const { filterAndLimitPosts } = require("./sort-filter");
    const stub = async (_url, opts) => {
      // The real scrapePage calls filterAndLimitPosts before
      // returning. We mirror that contract here.
      const raw = [
        { id: "p1", content: "newest (should drop)", postedAt: new Date("2026-06-12T20:00:00Z") },
        { id: "p2", content: "on cutoff day 23:59 ICT", postedAt: new Date("2026-06-12T16:59:00Z") },
        { id: "p3", content: "yesterday", postedAt: new Date("2026-06-10T08:00:00Z") },
      ];
      return filterAndLimitPosts(raw, opts.limit, opts.untilDate);
    };
    const port = await bootSidecar(stub);
    const r = await postJson(port, "/crawl", {
      pageUrl: "https://www.facebook.com/somepage",
      limit: 4,
      untilDate: until,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.posts.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("returns all posts when no untilDate is sent", async () => {
    const { filterAndLimitPosts } = require("./sort-filter");
    const stub = async (_url, opts) => {
      const raw = [
        { id: "p1", content: "newest", postedAt: new Date("2026-06-12T20:00:00Z") },
        { id: "p2", content: "yesterday", postedAt: new Date("2026-06-11T08:00:00Z") },
        { id: "p3", content: "day before", postedAt: new Date("2026-06-10T08:00:00Z") },
      ];
      return filterAndLimitPosts(raw, opts.limit, opts.untilDate);
    };
    const port = await bootSidecar(stub);
    const r = await postJson(port, "/crawl", {
      pageUrl: "https://www.facebook.com/somepage",
      limit: 4,
    });
    expect(r.status).toBe(200);
    expect(r.body.posts.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("returns 400 when pageUrl is missing", async () => {
    const stub = async () => [];
    const port = await bootSidecar(stub);
    const r = await postJson(port, "/crawl", { limit: 4 });
    expect(r.status).toBe(400);
  });
});
