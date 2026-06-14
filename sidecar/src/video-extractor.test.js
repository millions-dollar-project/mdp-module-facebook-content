/**
 * Tests for the pure video-URL helpers.
 *
 * Run with `pnpm test` (vitest globals: describe/it/expect).
 *
 * These exercise the same logic the scraper runs inside page.evaluate,
 * but on plain JS strings so the tests don't need jsdom/Playwright.
 */
const {
  isVideoUrl,
  isVideoPermalink,
  extractVideoUrlsFromJson,
  extractVideoUrlsFromHtml,
} = require("./video-extractor");

describe("isVideoPermalink", () => {
  it("accepts /videos/ and /video/ paths", () => {
    expect(isVideoPermalink("https://www.facebook.com/page/videos/12345")).toBe(true);
    expect(isVideoPermalink("https://www.facebook.com/page/video/12345")).toBe(true);
  });
  it("accepts /reel/ paths", () => {
    expect(isVideoPermalink("https://www.facebook.com/reel/12345")).toBe(true);
  });
  it("rejects /posts/ photo-only links", () => {
    expect(isVideoPermalink("https://www.facebook.com/page/posts/pfbid.abc")).toBe(false);
  });
  it("rejects empty/null", () => {
    expect(isVideoPermalink("")).toBe(false);
    expect(isVideoPermalink(null)).toBe(false);
    expect(isVideoPermalink(undefined)).toBe(false);
  });
});

describe("isVideoUrl", () => {
  it("accepts .mp4 / .webm / .m3u8 / .mpd files (with or without query)", () => {
    expect(isVideoUrl("https://video.xx.fbcdn.net/v/t42.17901-2/12345_n.mp4?_nc_cat=1")).toBe(true);
    expect(isVideoUrl("https://x.com/abc.webm")).toBe(true);
    expect(isVideoUrl("https://x.com/abc.m3u8")).toBe(true);
    expect(isVideoUrl("https://x.com/abc.mpd")).toBe(true);
  });
  it("accepts Facebook /video/ and playback URLs", () => {
    expect(isVideoUrl("https://video.xx.fbcdn.net/video/playback?vid=12345")).toBe(true);
  });
  it("accepts blob: URLs (in-page player)", () => {
    expect(isVideoUrl("blob:https://www.facebook.com/abc-123")).toBe(true);
  });
  it("rejects image URLs", () => {
    expect(isVideoUrl("https://scontent.xx.fbcdn.net/v/t1.6435-9/12345_n.jpg")).toBe(false);
    expect(isVideoUrl("https://scontent.xx.fbcdn.net/v/t1.6435-9/12345_n.png")).toBe(false);
    expect(isVideoUrl("https://scontent.xx.fbcdn.net/v/t1.6435-9/12345_n.webp")).toBe(false);
  });
  it("rejects post permalinks", () => {
    expect(isVideoUrl("https://www.facebook.com/page/posts/pfbid.abc")).toBe(false);
  });
  it("rejects empty / non-string", () => {
    expect(isVideoUrl("")).toBe(false);
    expect(isVideoUrl(null)).toBe(false);
    expect(isVideoUrl(undefined)).toBe(false);
    expect(isVideoUrl(123)).toBe(false);
  });
});

describe("extractVideoUrlsFromJson", () => {
  it("finds playable_url, browser_native_sd_url, browser_native_hd_url", () => {
    const data = JSON.stringify({
      __ar: 1,
      post_id: "12345",
      video: {
        playable_url: "https://video.xx.fbcdn.net/v/abc.mp4?_nc=1",
        browser_native_sd_url: "https://video.xx.fbcdn.net/v/abc_sd.mp4?_nc=1",
        browser_native_hd_url: "https://video.xx.fbcdn.net/v/abc_hd.mp4?_nc=1",
        thumbnail: "https://scontent.xx.fbcdn.net/v/abc.jpg",
      },
    });
    const out = extractVideoUrlsFromJson(data);
    expect(out).toContain("https://video.xx.fbcdn.net/v/abc.mp4?_nc=1");
    expect(out).toContain("https://video.xx.fbcdn.net/v/abc_sd.mp4?_nc=1");
    expect(out).toContain("https://video.xx.fbcdn.net/v/abc_hd.mp4?_nc=1");
    // Thumbnail must NOT be picked up (it's a jpg, not under a video key)
    expect(out.some((u) => u.endsWith(".jpg"))).toBe(false);
  });

  it("descends into nested attachments / video objects", () => {
    const data = JSON.stringify({
      attachments: [
        {
          media: {
            video: {
              playable_url: "https://video.xx.fbcdn.net/v/nested.mp4",
            },
          },
        },
      ],
    });
    expect(extractVideoUrlsFromJson(data)).toEqual([
      "https://video.xx.fbcdn.net/v/nested.mp4",
    ]);
  });

  it("ignores non-video fields like url / permalink", () => {
    const data = JSON.stringify({
      url: "https://www.facebook.com/page/posts/pfbid.abc",
      permalink: "https://www.facebook.com/page/posts/pfbid.abc",
      image: { uri: "https://x.com/photo.jpg" },
    });
    expect(extractVideoUrlsFromJson(data)).toEqual([]);
  });

  it("dedupes while preserving order", () => {
    const data = JSON.stringify({
      playable_url: "https://video.xx.fbcdn.net/v/abc.mp4",
      browser_native_sd_url: "https://video.xx.fbcdn.net/v/abc.mp4",
    });
    expect(extractVideoUrlsFromJson(data)).toEqual([
      "https://video.xx.fbcdn.net/v/abc.mp4",
    ]);
  });

  it("returns [] for invalid JSON without throwing", () => {
    expect(extractVideoUrlsFromJson("not json {")).toEqual([]);
    expect(extractVideoUrlsFromJson("")).toEqual([]);
    expect(extractVideoUrlsFromJson(null)).toEqual([]);
    expect(extractVideoUrlsFromJson(undefined)).toEqual([]);
  });
});

describe("extractVideoUrlsFromHtml", () => {
  it("picks up <video src=...> tags", () => {
    const html = `<div><video src="https://video.xx.fbcdn.net/v/abc.mp4?_nc=1" controls></video></div>`;
    expect(extractVideoUrlsFromHtml(html)).toEqual([
      "https://video.xx.fbcdn.net/v/abc.mp4?_nc=1",
    ]);
  });
  it("picks up <source src=...> children of <video>", () => {
    const html = `<video><source src="https://x.com/abc.webm" type="video/webm"/></video>`;
    expect(extractVideoUrlsFromHtml(html)).toEqual(["https://x.com/abc.webm"]);
  });
  it("ignores image <img src=...> tags even with similar paths", () => {
    const html = `<div><img src="https://scontent.xx.fbcdn.net/v/photo.jpg"/></div>`;
    expect(extractVideoUrlsFromHtml(html)).toEqual([]);
  });
  it("handles blob: URLs (in-page player)", () => {
    const html = `<video src="blob:https://www.facebook.com/abc-123"></video>`;
    expect(extractVideoUrlsFromHtml(html)).toEqual(["blob:https://www.facebook.com/abc-123"]);
  });
  it("dedupes and preserves order", () => {
    const html = `<video src="https://x.com/abc.mp4"></video><source src="https://x.com/abc.mp4"/>`;
    expect(extractVideoUrlsFromHtml(html)).toEqual(["https://x.com/abc.mp4"]);
  });
  it("returns [] for empty / non-string", () => {
    expect(extractVideoUrlsFromHtml("")).toEqual([]);
    expect(extractVideoUrlsFromHtml(null)).toEqual([]);
  });
});
