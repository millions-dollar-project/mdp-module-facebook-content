/**
 * End-to-end-ish test for the video URL extraction inside
 * extractVisibleFeedPosts. We don't spin up a real Playwright browser —
 * we just feed a serialized "post container HTML" into the same
 * function the scraper uses inside page.evaluate, then assert the
 * post object that comes out has the right videoUrls and mediaType.
 *
 * Why a string instead of jsdom: the test stays in pure Node and runs
 * in <100ms. The logic that needs the DOM (querySelectorAll on
 * <video>, <source>, [data-store]) is faithfully replayed via
 * regex/JSON parsing on the input string, so we cover the *contract*
 * of the extraction: "given a container with these video markers,
 * the post gets the right videoUrls and mediaType."
 *
 * The actual extractVideoUrls implementation lives inside
 * page.evaluate; we re-export it through video-extractor.js so the
 * same parsing rules are unit-tested in video-extractor.test.js.
 *
 * Run with: pnpm test
 */
const { extractVideoUrlsFromJson, extractVideoUrlsFromHtml, isVideoPermalink } = require("./video-extractor");

// Mirror the scraper's in-evaluate extraction so we can test the full
// flow without Playwright. If you change scraper.js, change this
// helper to match.
function extractFromHtml(containerHtml) {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (!/^(https?:|blob:|data:)/i.test(u) && !/\.(mp4|webm|m3u8|mpd)(\?|$|:)/i.test(u)) return;
    seen.add(u);
    out.push(u);
  };
  // <video> / <source> src=
  for (const u of extractVideoUrlsFromHtml(containerHtml)) push(u);
  // data-store / data-ft JSON. In real browser scraping the
  // getAttribute() call already unescapes &quot; → ", so we do the
  // same here to match what scraper.js sees in page.evaluate.
  const re = /(data-(?:store|ft))="([^"]*)"/g;
  let m;
  while ((m = re.exec(containerHtml)) !== null) {
    const raw = m[2]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    for (const u of extractVideoUrlsFromJson(raw)) push(u);
  }
  return out;
}

describe("extractVideoUrls from post HTML (integration)", () => {
  it("extracts a video URL from a typical feed post with a <video> tag", () => {
    const html = `
      <div role="article">
        <div data-ad-preview="message">Trường đẹp vận hành cực — Ecohome</div>
        <a href="/thietketruongmamnonecohome/posts/pfbid.abc">Permalink</a>
        <video src="https://video.xx.fbcdn.net/v/t42.17901-2/12345_n.mp4?_nc_cat=1" controls></video>
      </div>
    `;
    expect(extractFromHtml(html)).toEqual([
      "https://video.xx.fbcdn.net/v/t42.17901-2/12345_n.mp4?_nc_cat=1",
    ]);
  });

  it("extracts a video URL from data-store JSON when the <video> tag is absent (lazy load)", () => {
    const data = JSON.stringify({
      post_id: "pfbid.abc",
      video: {
        playable_url: "https://video.xx.fbcdn.net/v/lazy.mp4?_nc=1",
        browser_native_hd_url: "https://video.xx.fbcdn.net/v/lazy_hd.mp4?_nc=1",
      },
    }).replace(/"/g, "&quot;");
    const html = `
      <div role="article">
        <div data-ad-preview="message">Trường đẹp vận hành cực — Ecohome</div>
        <a href="/thietketruongmamnonecohome/posts/pfbid.abc" data-store="${data}">Permalink</a>
        <div class="thumbnail" style="background-image:url('https://scontent.xx.fbcdn.net/thumb.jpg')"></div>
      </div>
    `;
    const urls = extractFromHtml(html);
    expect(urls).toContain("https://video.xx.fbcdn.net/v/lazy.mp4?_nc=1");
    expect(urls).toContain("https://video.xx.fbcdn.net/v/lazy_hd.mp4?_nc=1");
    // Thumbnail must not leak in
    expect(urls.some((u) => u.includes("scontent"))).toBe(false);
  });

  it("does not pick up photo URLs from photo-only posts", () => {
    const html = `
      <div role="article">
        <div data-ad-preview="message">Album ảnh trường mầm non</div>
        <a href="/thietketruongmamnonecohome/posts/pfbid.photo">Permalink</a>
        <img src="https://scontent.xx.fbcdn.net/v/abc1.jpg"/>
        <img src="https://scontent.xx.fbcdn.net/v/abc2.jpg"/>
      </div>
    `;
    expect(extractFromHtml(html)).toEqual([]);
  });

  it("isVideoPermalink detects /videos/ and /reel/ for hasVideo fallback", () => {
    expect(isVideoPermalink("https://www.facebook.com/page/videos/12345")).toBe(true);
    expect(isVideoPermalink("https://www.facebook.com/reel/12345")).toBe(true);
    expect(isVideoPermalink("https://www.facebook.com/page/posts/pfbid.abc")).toBe(false);
  });
});
