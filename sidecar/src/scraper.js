/**
 * Simplified Facebook page scraper using Playwright.
 * Ports the feed-only crawl logic from SCA's facebook-scraper.ts.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { filterAndLimitPosts } = require("./sort-filter");
const { parseGraphqlBody } = require("./facebook-graphql-parser");

const USER_DATA_DIR = process.env.FACEBOOK_CRAWLER_PROFILE || path.join(process.env.APPDATA || ".", ".facebook-crawler-profile");

async function ensureContext({ profilePath = USER_DATA_DIR, headless = true } = {}) {
  const launchOptions = {
    headless: process.env.CRAWLER_HEADLESS === "false" ? false : headless,
    channel: "chrome",
    // pipe: false → use TCP debug port instead of stdio pipes. The stdio
    // pipe path is the default for launchPersistentContext and on Windows
    // it conflicts with Chrome 144+ when channel="chrome" (system Chrome),
    // causing the new browser to exit with code 21 before Playwright can
    // attach. Switching to a debug port is the documented workaround and
    // is stable across the codebase's other Playwright launches.
    pipe: false,
    args: [
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  };
  if (process.env.FACEBOOK_CRAWLER_PROXY) {
    launchOptions.proxy = { server: process.env.FACEBOOK_CRAWLER_PROXY };
  }
  const context = await chromium.launchPersistentContext(profilePath || USER_DATA_DIR, launchOptions);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return context;
}

async function navigateFacebookUrl(page, pageUrl) {
  const normalized = pageUrl.trim().replace(/\/$/, "");
  const attempts = [
    { url: normalized, waitUntil: "domcontentloaded" },
    { url: normalized, waitUntil: "load" },
    { url: normalized.replace(/https?:\/\/(www\.)?facebook\.com/i, "https://m.facebook.com"), waitUntil: "domcontentloaded" },
  ];
  let lastErr = null;
  for (const a of attempts) {
    try {
      await page.goto(a.url, { waitUntil: a.waitUntil, timeout: 45000 });
      await page.waitForTimeout(2500);
      const cur = page.url();
      if (cur.includes("facebook.com/login") || cur.includes("facebook.com/recover")) {
        throw new Error("Facebook requires login. Set CRAWLER_HEADLESS=false and log in manually.");
      }
      await page.waitForSelector('[role="article"], [data-pagelet="FeedUnit"], #timeline, .story_body_container, [data-testid="post_message"]', { timeout: 15000 }).catch(() => {});
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Cannot open Facebook page");
}

async function expandSeeMore(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[role="button"], [tabindex="0"], span, div').forEach((el) => {
      const t = (el.getAttribute("aria-label") || el.textContent || "").trim().toLowerCase();
      if (t === "xem thêm" || t === "see more" || t.endsWith("xem thêm") || t.endsWith("see more") || t === "…" || t.endsWith("…")) {
        if (t.length < 40 && !t.includes("bình luận") && !t.includes("comment")) el.click();
      }
    });
  });
}

async function extractVisibleFeedPosts(page, pageInfo, expectedPageSlug) {
  return page.evaluate(({ pageInfo, expectedPageSlug }) => {
    const normalizeUrl = (href) => {
      try {
        const u = new URL(href);
        if (u.searchParams.has("comment_id")) return "";
        if (u.pathname.startsWith("/photo")) {
          const set = u.searchParams.get("set") || "";
          const postId = set.match(/^pcb\.(\d+)$/i)?.[1];
          return postId && expectedPageSlug
            ? `${u.origin}/${expectedPageSlug}/posts/${postId}`
            : "";
        }
        if (u.pathname.startsWith("/reel/") || /\/posts\//i.test(u.pathname) || /\/videos?\//i.test(u.pathname)) {
          return `${u.origin}${u.pathname.replace(/\/$/, "")}`;
        }
        if (u.searchParams.has("story_fbid")) {
          return `${u.origin}${u.pathname}?story_fbid=${u.searchParams.get("story_fbid") || ""}`;
        }
        return "";
      } catch { return ""; }
    };

    // Perma-anchors in the main feed carry the page slug in their path
    // (e.g. /thietketruongmamnonecohome/posts/pfbid... or
    // /thietketruongmamnonecohome/videos/123). Reels are the exception:
    // their permalink is just /reel/123 with no page slug, so we can NOT
    // whitelist them here — doing so used to leak sidebar reels
    // ("Suggested for you" / "Có thể bạn quan tâm") into the result.
    // The caller (isInSidebar + isInMainFeedColumn below) is now
    // responsible for keeping reel anchors that genuinely belong to the
    // page's main content.
    const belongsToPage = (href) => {
      try {
        const u = new URL(href);
        if (!u.hostname.includes("facebook.com")) return false;
        if (/\/groups\//i.test(u.pathname) || /\/people\//i.test(u.pathname)) return false;
        if (u.searchParams.has("comment_id")) return false;
        const slug = expectedPageSlug?.toLowerCase();
        if (slug && u.pathname.toLowerCase().includes(`/${slug}`)) return true;
        return false;
      } catch { return false; }
    };

    // Heuristic: walk up the DOM and look for "sidebar" markers. The FB
    // right rail uses <div role="complementary"> or sections whose
    // heading reads "Có thể bạn quan tâm" / "Suggested for you" /
    // "People you may know" / "Suggested reels". Anchors inside those
    // containers are NOT page posts — they're cross-page suggestions.
    const SIDEBAR_HEADING_RE = /có thể bạn quan tâm|suggested for you|people you may know|liên quan|recommended|gợi ý cho bạn|suggested reels/i;
    const isInSidebar = (el) => {
      let node = el;
      for (let i = 0; i < 30 && node && node !== document.body; i++, node = node.parentElement) {
        if (!node) break;
        if (node.getAttribute && node.getAttribute('role') === 'complementary') return true;
        if (node.tagName === 'ASIDE') return true;
        if (node.id && /right.?rail|sidebar/i.test(node.id)) return true;
        if (node.getAttribute && /right.?rail|sidebar/i.test(node.getAttribute('data-pagelet') || '')) return true;
        if (node.tagName === 'SECTION' || node.tagName === 'DIV') {
          const heading = node.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > span');
          if (heading && SIDEBAR_HEADING_RE.test((heading.textContent || "").trim())) return true;
        }
      }
      return false;
    };

    // Pinned post: FB renders a small pin icon with aria-label like
    // "Bài viết đã ghim" / "Pinned post" / "Đã ghim" inside the article
    // header. We also accept a text match as fallback for older layouts.
    const PINNED_RE = /bài viết đã ghim|bài viết được ghim|đã ghim|pinned (post|video|reel)|^ghim\b/i;
    const isPinned = (container) => {
      const labelled = container.querySelector('[aria-label]');
      if (labelled) {
        for (const el of container.querySelectorAll('[aria-label]')) {
          if (PINNED_RE.test(el.getAttribute('aria-label') || '')) return true;
        }
      }
      const head = (container.innerText || '').slice(0, 300);
      return PINNED_RE.test(head);
    };

    // Sponsored / ad: FB shows "Được tài trợ" / "Sponsored" near the
    // post author, often with a sub-link "Tại sao tôi thấy quảng cáo
    // này?" / "Why am I seeing this ad?".
    const SPONSORED_RE = /được tài trợ|^sponsored$|tại sao tôi thấy quảng cáo|why am i seeing this ad|ẩn quảng cáo|hide ad/i;
    const isSponsored = (container) => {
      // Subtree link to /ads/about/ is the strongest signal.
      if (container.querySelector('a[href*="/ads/about/"]')) return true;
      const head = (container.innerText || '').slice(0, 600);
      return SPONSORED_RE.test(head);
    };

    const relativeDate = (raw) => {
      // Facebook renders short relative time on reels as "19h" (no
      // separator) and on regular posts as "5 phút trước" / "5 minutes
      // ago". Include the bare 'h' / 'd' / 'w' in the alternatives so
      // both layouts parse.
      const m = raw.trim().toLowerCase().match(/^(\d+)\s*(giây|phút|giờ|ngày|tuần|tháng|năm|seconds?|minutes?|hours?|days?|weeks?|months?|years?|h|d|w)(?:\s+(?:trước|ago))?\s*$/i);
      if (!m) return "";
      const n = Number(m[1]);
      const u = m[2];
      const ms = /giây|second|^s$/.test(u) ? n * 1000 : /phút|minute|^m$/.test(u) ? n * 60 * 1000 : /giờ|hour|^h$/.test(u) ? n * 60 * 60 * 1000 : /ngày|day|^d$/.test(u) ? n * 24 * 60 * 60 * 1000 : /tuần|week|^w$/.test(u) ? n * 7 * 24 * 60 * 60 * 1000 : /tháng|month/.test(u) ? n * 30 * 24 * 60 * 60 * 1000 : /năm|year/.test(u) ? n * 365 * 24 * 60 * 60 * 1000 : 0;
      return ms > 0 ? new Date(Date.now() - ms).toISOString() : "";
    };

    // Parse a compact count string FB uses: "1.4K", "1.2K", "1M", "123".
    // Returns 0 for unparseable input.
    const parseCompactCount = (raw) => {
      if (!raw) return 0;
      const s = String(raw).trim().replace(/,/g, "").toLowerCase();
      const m = s.match(/^(\d+(?:\.\d+)?)\s*([km]?)$/);
      if (!m) return 0;
      const n = parseFloat(m[1]);
      if (!Number.isFinite(n)) return 0;
      const mult = m[2] === "k" ? 1000 : m[2] === "m" ? 1000000 : 1;
      return Math.round(n * mult);
    };

    // Best-effort real-time extractor. Order of preference:
    //   1. <a data-utime="…"> on the permalink — Unix seconds, exact.
    //   2. <time datetime="…"> element — ISO 8601.
    //   3. Relative Vietnamese/English text ("5 phút trước" / "19h").
    //
    // Note: we extract just the leading time prefix (e.g. "19h") instead
    // of the full textContent, because some anchors render "19h · Shared
    // with Public" / "5 phút trước · Công khai" and the trailing context
    // would defeat relativeDate's anchored regex.
    const extractPostedAt = (container) => {
      // Search through all ancestors for data-utime (FB sometimes puts it on the article wrapper)
      try {
        let node = container;
        for (let i = 0; i < 15 && node; i++) {
          const utime = node.getAttribute && node.getAttribute('data-utime');
          if (utime) {
            const n = Number(utime);
            if (Number.isFinite(n) && n > 0 && n < 1700000000) return new Date(n > 1e12 ? n : n * 1000).toISOString();
          }
          node = node.parentElement;
        }
      } catch {}
      // Also try querying within container
      try {
        const utimeEl = container.querySelector('[data-utime]');
        if (utimeEl) {
          const n = Number(utimeEl.getAttribute('data-utime'));
          if (Number.isFinite(n) && n > 0 && n < 1700000000) return new Date(n > 1e12 ? n : n * 1000).toISOString();
        }
      } catch {}
      try {
        const utimeEl = container.querySelector('a[data-utime]');
        if (utimeEl) {
          const n = Number(utimeEl.getAttribute('data-utime'));
          if (Number.isFinite(n) && n > 0) return new Date(n > 1e12 ? n : n * 1000).toISOString();
        }
      } catch {}
      try {
        const tEl = container.querySelector('time[datetime]');
        if (tEl) {
          const d = new Date(tEl.getAttribute('datetime'));
          if (!isNaN(d.getTime())) return d.toISOString();
        }
      } catch {}
      const TIME_PREFIX = /^\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm|seconds?|minutes?|hours?|days?|weeks?|months?|years?|h|d|w)\b/i;
      const timeText = Array.from(container.querySelectorAll("a, span, time"))
        .map((el) => ((el.textContent || "").trim().match(TIME_PREFIX) || [""])[0])
        .find((t) => t) || "";
      return relativeDate(timeText) || "";
    };

    // Reaction / like count. Strongest signal: the reaction toolbar
    // button has aria-label like "Like: 3 people" or "Love: 1.2K people".
    // Fallback: a compact number near the "See who reacted" toolbar.
    const extractLikes = (container) => {
      const labelled = container.querySelector('[aria-label^="Like:"]');
      if (labelled) {
        const m = (labelled.getAttribute("aria-label") || "").match(/^Like:\s*([\d.,KkMm]+)/i);
        if (m) return parseCompactCount(m[1]);
      }
      const toolbar = container.querySelector('[aria-label="See who reacted to this"]');
      if (toolbar) {
        const m = (toolbar.textContent || "").trim().match(/([\d.,]+)\s*[KkMm]?/);
        if (m) return parseCompactCount(m[1]);
      }
      return 0;
    };

    // Collect the colored reaction emoji icons FB renders in the
    // "See who reacted to this" / reaction-summary toolbar. These are
    // the same URLs that drive the "👍❤️😂" row on the real feed —
    // we ship them up so the plugin can render <img> instead of plain
    // unicode (which doesn't carry the FB-specific colors). Limited
    // to the toolbar so we don't pull every emoji in the post body.
    const extractReactionIcons = (container) => {
      const toolbar = container.querySelector('[aria-label="See who reacted to this"]');
      if (!toolbar) return [];
      const out = [];
      const seen = new Set();
      const imgs = toolbar.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.getAttribute("src") || "";
        if (!src) continue;
        // Only the colored "external" reaction icons
        // (static.xx.fbcdn.net/rsrc.php/...) — skip the line-art
        // ones inside the post body (which the body emoji pass
        // already filters via isEmojiImage).
        if (!/scontent|fbcdn/i.test(src)) continue;
        if (seen.has(src)) continue;
        seen.add(src);
        out.push(src);
        if (out.length >= 6) break;
      }
      return out;
    };

    // Comment count. FB exposes it as either:
    //   - <a aria-label="View 1 comment" / "1.2K comments">  (most reliable)
    //   - "All reactions: <likes>\n<comments>" multi-line summary
    //     (the second number is comments, not shares)
    //
    // The "All reactions:" block is fragile: the likes and comments
    // numbers are rendered in separate inline elements that are NOT
    // direct nextElementSibling of the label (FB nests the metrics in
    // a sibling wrapper). So instead of walking siblings we read the
    // textContent of the smallest containing block, find "All
    // reactions:" and pick the first two compact numbers in order.
    const extractComments = (container) => {
      const labelled = container.querySelector('[aria-label*="comment" i][aria-label*="\\d" i], [aria-label^="View"][aria-label*="comment" i]');
      if (labelled) {
        const m = (labelled.getAttribute("aria-label") || "").match(/([\d.,]+)\s*[KkMm]?\s*comment/i);
        if (m) return parseCompactCount(m[1]);
      }
      const allRx = Array.from(container.querySelectorAll("span, div"))
        .find((el) => /^All reactions:?$/i.test((el.textContent || "").trim()));
      if (allRx) {
        // Walk up a few ancestors to a block whose text contains BOTH
        // numbers — that's the metrics row.
        let block = allRx;
        for (let i = 0; i < 4 && block && block.parentElement; i++) {
          const t = block.textContent || "";
          if (t.includes("All reactions") && (t.match(/\d+.*\d+/s) || []).length) break;
          block = block.parentElement;
        }
        if (block) {
          // FB renders the metrics as sibling <span> elements with NO
          // text separator between them, so .textContent collapses
          // "4" + "2" into "42". Walk leaf text nodes individually so
          // we capture them as distinct numbers.
          const nums = [];
          const walker = (block.ownerDocument || document).createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
          let n;
          while ((n = walker.nextNode())) {
            const t = (n.nodeValue || "").trim();
            if (/^[\d.,]+[KkMm]?$/.test(t)) {
              nums.push(parseCompactCount(t));
              if (nums.length >= 2) break;
            }
          }
          // nums[0] is likes (already captured), nums[1] is comments.
          if (nums.length >= 2) return nums[1];
        }
      }
      return 0;
    };

    // Share count. FB has no first-class share-count element in the
    // reels feed. Look for a "1 share" / "1K shares" / "1 lượt chia sẻ"
    // text node near the action bar. If nothing matches, leave 0.
    const extractShares = (container) => {
      const labelled = container.querySelector('[aria-label*="share" i][aria-label*="\\d" i]');
      if (labelled) {
        const m = (labelled.getAttribute("aria-label") || "").match(/([\d.,]+)\s*[KkMm]?\s*share/i);
        if (m) return parseCompactCount(m[1]);
      }
      const SHARE_RE = /^([\d.,]+)\s*[KkMm]?\s*(shares?|lượt chia sẻ|chia sẻ)\b/i;
      for (const el of container.querySelectorAll("span, a, div")) {
        const t = (el.textContent || "").trim();
        // Skip if the node contains nested non-text (e.g. icons) to avoid
        // matching the whole action button row.
        if (el.children.length > 2) continue;
        const m = t.match(SHARE_RE);
        if (m) return parseCompactCount(m[1]);
      }
      return 0;
    };

    // Facebook renders emoji (👇 etc.) as <img> tags served from
    // `static.xx.fbcdn.net/images/emoji.php/...`. Filter those out so
    // they don't pollute mediaUrls / thumbnailUrls.
    const isEmojiImage = (img) => {
      const src = img.getAttribute("src") || "";
      return /\/images\/emoji\.php\//i.test(src) || /emoji/i.test(img.getAttribute("alt") || "");
    };

    // Collect non-emoji media. Returned in DOM order (top of post →
    // bottom), deduplicated. For reels the first image is the video
    // thumbnail.
    const collectMediaUrls = (container) => {
      const out = [];
      const seen = new Set();
      for (const img of container.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]')) {
        if (isEmojiImage(img)) continue;
        const src = img.getAttribute("src") || "";
        if (!src || seen.has(src)) continue;
        seen.add(src);
        out.push(src);
      }
      return out;
    };

    // Best-effort real-time extractor. Order of preference:
    //   1. <a data-utime="…"> on the permalink — Unix seconds, exact.
    //   2. <time datetime="…"> element — ISO 8601.
    //   3. Relative Vietnamese/English text ("5 phút trước").
    //
    // (declared above with the other extractors)

    const cleanText = (raw) => raw.replace(/(?:\bFacebook\b\s*){2,}/g, "").replace(/\s*Ẩn bớt.*$/i, "").replace(/\s*Xem thêm\s*/gi, " ").replace(/\n{3,}/g, "\n\n").trim();

    const cleanFeedCaption = (raw) => {
      let text = cleanText(raw)
        .replace(new RegExp((pageInfo.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "")
        .replace(/Tác giả/g, "").replace(/Trả lời/g, "")
        .replace(/Bình luận dưới tên.*?trước/gi, "").trim();
      const dot = text.indexOf("·");
      if (dot >= 0) text = text.slice(dot + 1).trim();
      return text
        .replace(/^Đã chia sẻ với Công khai\s*/i, "")
        .replace(/\b(?:Thích|Bày tỏ cảm xúc|Viết bình luận|Gửi nội dung này).*$/i, "")
        .replace(/\bChỉ báo trạng thái online\b.*$/i, "")
        .replace(/\bĐang hoạt động\b.*$/i, "")
        .replace(/\b\d+\s*bình luận\b.*$/i, "")
        .replace(/\s*Ẩn bớt.*$/i, "")
        // English "See less" / "See more" — same UI control as
        // "Ẩn bớt" / "Xem thêm". Strip anywhere in the string, not
        // just at the end, because Facebook sometimes leaves trailing
        // hidden chars (e.g. zero-width space) after the button text
        // and the end-anchored regex misses them.
        .replace(/\s*See (less|more)\b/gi, "")
        // "All reactions: 1.4K" / "All reactions:" — drop the header
        // and everything after, since the metric line is meaningless
        // without a logged-in session. Use [\s\S]* (not .*) so the
        // match eats newlines too — otherwise the multi-line metrics
        // block ("3\n1\nLike\nComment") survives.
        .replace(/^.*\bAll reactions\b[^\n]*[\s\S]*$/im, "")
        // Video player time display ("0:00 / 1:00") — not part of the
        // caption. Match either inline "0:00 / 1:00" or a standalone
        // line containing only that pattern.
        .replace(/\b\d+:\d+\s*\/\s*\d+:\d+\b/g, "")
        // Action buttons rendered on their own lines (e.g. reels show
        // "Like" and "Comment" as inline action links below the
        // caption). Strip the standalone form so they don't pollute
        // the text.
        .replace(/^\s*(Like|Comment|Share)\s*$/gim, "")
        .replace(/(?:m\.me|Ảnh từ bài viết|Nhà thiết kế kiến trúc|Gửi tin nhắn|Xem thêm bình luận|Viết bình luận).*$/i, "")
        .replace(/\s*\+\d+\b.*$/i, "")
        .replace(/\b\d+\s+(?:giây|phút|giờ|ngày|tuần|tháng|năm)\s+trước\b/gi, "")
        .trim();
    };

    const posts = [];
    const seen = new Set();
    const seenContainers = new Set();
    let postsHeading = null;
    for (const h of Array.from(document.querySelectorAll("h2, h3"))) {
      if (/^Bài viết$|^Posts$/i.test((h.textContent || "").trim())) { postsHeading = h; break; }
    }
    const isInPostsSection = (el) => {
      if (!postsHeading) return true;
      const pos = postsHeading.compareDocumentPosition(el);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 || postsHeading.contains(el);
    };

    const findPostContainer = (anchor) => {
      let best = null, node = anchor;
      // Walk up and ACCEPT if it has images (carousel) OR text. The
      // previous code required txt >= 20, but FB articles render innerText
      // as empty for lazy-loaded carousels, so we drop that floor and
      // rely on imgCount as the signal instead.
      for (let d = 0; d < 12 && node && node.parentElement; d++) {
        node = node.parentElement;
        const imgCount = node.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]').length;
        if (imgCount >= 1) {
          best = node;
          break;
        }
      }
      return best;
    };

    const anchors = Array.from(document.querySelectorAll(
      'a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"], a[href*="/photo/"][href*="set=pcb."], a[href*="/photo.php"][href*="set=pcb."]'
    ));
    anchors.sort((a, b) => {
      const ap = /\/posts\/pfbid/i.test(a.href) ? 0 : 1;
      const bp = /\/posts\/pfbid/i.test(b.href) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });

    for (const a of anchors) {
      const href = a.href;
      if (isInSidebar(a)) continue;            // skip cross-page suggestions
      if (!isInPostsSection(a)) continue;
      // Slug-based attribution. For /reel/ anchors (no slug) we still
      // accept the anchor if it sits in the main feed column — that's
      // how reels that genuinely belong to the page get included, while
      // sidebar reels are excluded by the isInSidebar check above.
      const isSlugged = (() => {
        try {
          const u = new URL(href);
          const slug = expectedPageSlug?.toLowerCase();
          if (!slug) return false;
          return u.pathname.toLowerCase().includes(`/${slug}`);
        } catch { return false; }
      })();
      const isMainColumnReel = /\/reel\//i.test(href);
      const isPageAlbum = /\/photo(?:\/|\.(?:php))?/i.test(href) && /[?&]set=pcb\.\d+/i.test(href);
      if (!isSlugged && !isMainColumnReel && !isPageAlbum) continue;

      const permalink = normalizeUrl(href);
      if (!permalink || seen.has(permalink)) continue;
      const container = findPostContainer(a);
      if (!container) continue;
      if (seenContainers.has(container)) continue;
      if (isPinned(container)) continue;         // skip pinned posts
      if (isSponsored(container)) continue;      // skip ads / sponsored
      seenContainers.add(container);
      seen.add(permalink);

      const caption = cleanFeedCaption((container.innerText || container.textContent || ""));
      // Keep post if it has caption OR media. Carousel posts may have
      // empty text but must be kept for their images.
      const postedAt = extractPostedAt(container);
      const mediaUrls = collectMediaUrls(container);
      const hasVideo = /\/reel\/|\/videos?\//i.test(permalink) || container.querySelector("video") != null;
      // For reel/video posts we don't have a direct mp4 URL in the DOM
      // (FB lazy-loads the player); the permalink is the best canonical
      // video URL the scraper can offer. For photo posts videoUrls is
      // empty.
      const videoUrls = hasVideo ? [permalink] : [];

      posts.push({
        id: (permalink.match(/(?:pfbid[\w-]+|reel\/(\d+)|videos?\/(\d+)|posts\/(\d+))/i)?.[0] || `feed_${posts.length}`).replace(/\//g, "_"),
        pageId: pageInfo.id || "",
        pageName: pageInfo.name || "",
        content: caption.slice(0, 280),
        fullContent: caption,
        mediaUrls,
        videoUrls,
        thumbnailUrls: mediaUrls.slice(0, 4),
        fullPicture: mediaUrls[0] || "",
        mediaType: hasVideo ? "video" : mediaUrls.length > 1 ? "carousel" : mediaUrls.length === 1 ? "photo" : "text",
        likes: extractLikes(container),
        comments: extractComments(container),
        shares: extractShares(container),
        reactionIcons: extractReactionIcons(container),
        postedAt: postedAt ? new Date(postedAt) : new Date(0),
        permalink,
        rawData: { feedTop: container.getBoundingClientRect().top + window.scrollY },
      });
    }

    // Sort by real posted time, newest first. Posts whose postedAt
    // failed to parse (epoch 0) sink to the bottom — that matches the
    // plugin's expectation that "newest first" is a real time order,
    // not "DOM render order".
    return posts.sort((a, b) => {
      const ta = new Date(a.postedAt).getTime();
      const tb = new Date(b.postedAt).getTime();
      const va = Number.isFinite(ta) ? ta : 0;
      const vb = Number.isFinite(tb) ? tb : 0;
      if (vb !== va) return vb - va;
      // Tie-breaker: stable DOM order (top of feed first) so the user
      // sees the same item twice in the same place when times tie.
      return (Number(a.rawData?.feedTop) || 0) - (Number(b.rawData?.feedTop) || 0);
    });
  }, { pageInfo, expectedPageSlug: (expectedPageSlug || "") });
}

async function extractPageInfo(page) {
  return page.evaluate(() => {
    const name = document.querySelector('h1')?.textContent?.trim() || "";
    const img = document.querySelector('img[data-imgperflogname="profileCoverPhoto"]') || document.querySelector('svg image') || document.querySelector('img[alt*="avatar"]');
    const avatar = img?.getAttribute('xlink:href') || img?.src || "";
    // Try to extract numeric page id from meta or url
    let id = "";
    const meta = document.querySelector('meta[property="al:android:url"]')?.content || "";
    const m = meta.match(/\/(\d+)\/?$/);
    if (m) id = m[1];
    return { id, name, avatar };
  });
}

async function scrapePage(pageUrl, { limit = 10, headless = true, untilDate = null, profilePath = null } = {}) {
  const context = await ensureContext({ profilePath: profilePath || USER_DATA_DIR, headless });
  const page = context.pages()[0] || (await context.newPage());
  const graphqlPosts = new Map();
  const hydratedAlbums = new Map();
  let pageInfo = { id: "", name: "", avatar: "" };
  const onResponse = async (response) => {
    const request = response.request();
    if (!request.url().includes("/api/graphql/")) return;
    try {
      const body = await response.text();
      for (const post of parseGraphqlBody(body, pageInfo)) {
        if (!post.permalink || graphqlPosts.has(post.permalink)) continue;
        graphqlPosts.set(post.permalink, post);
      }
    } catch {}
  };
  page.on("response", onResponse);
  try {
    await navigateFacebookUrl(page, pageUrl);
    pageInfo = await extractPageInfo(page);
    const pageSlug = (pageUrl.match(/facebook\.com\/([^/?#]+)/i)?.[1] || "").toLowerCase();

    const domPosts = new Map();
    // Pull more than `limit` from the feed so the post-filter has enough
    // headroom:
    //  - when untilDate is set, the date cut can drop more posts,
    //  - when posts are filtered out as pinned / sponsored / sidebar,
    //    the *effective* set is smaller than what the DOM yielded and we
    //    need to scroll further to refill.
    // Triple the per-limit headroom (was 2x/4x) so date filter + skip
    // rules don't starve the result list.
    const rounds = Math.max(12, limit * (untilDate ? 8 : 6));
    for (let r = 0; r < rounds; r++) {
      await expandSeeMore(page);
      const visible = await extractVisibleFeedPosts(page, pageInfo, pageSlug);
      for (const p of visible) {
        const key = p.permalink || p.id;
        if (!key || domPosts.has(key)) continue;
        const text = (p.fullContent || p.content || "").trim();
        // Loosen: any post with content OR media OR a video marker
        // counts. The previous "text > 40 chars" rule dropped valid
        // photo/reel posts whose caption was just a hashtag line.
        if (text.length > 0 || p.mediaUrls.length > 0 || p.mediaType === "video") {
          domPosts.set(key, p);
        }
      }
      if (r >= 4 && (graphqlPosts.size >= limit || domPosts.size >= limit)) break;
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(700);
    }

    const graphIds = new Set(Array.from(graphqlPosts.values()).map((post) => String(post.id || "")));
    const missingAlbums = Array.from(domPosts.values())
      .filter((post) => /^posts_\d+$/i.test(post.id || ""))
      .filter((post) => !graphIds.has(String(post.id).replace(/^posts_/i, "")))
      .slice(0, limit > 0 ? limit : 5);
    for (const album of missingAlbums) {
      await page.goto(album.permalink, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(1800);
      const hydrated = await extractPermalinkPost(page, album, pageInfo);
      if (hydrated) hydratedAlbums.set(hydrated.permalink, hydrated);
    }

    const posts = mergeGraphqlAndDomPosts(graphqlPosts, domPosts, pageSlug, hydratedAlbums);
    return untilDate
      ? filterAndLimitPosts(posts, limit, untilDate)
      : posts.slice(0, limit > 0 ? limit : undefined);
  } finally {
    page.off("response", onResponse);
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function extractPermalinkPost(page, fallback, pageInfo) {
  const data = await page.evaluate(() => {
    const root = document.querySelector('[role="dialog"]') || document.querySelector('[role="article"]');
    if (!root) return null;
    const message = root.querySelector('[data-ad-preview="message"], [data-testid="post_message"]');
    const imageUrls = [];
    for (const img of root.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]')) {
      const src = img.getAttribute("src") || "";
      if (!src || !/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(src)) continue;
      if (/emoji|profile|s(?:32|40|50)x(?:32|40|50)/i.test(src)) continue;
      if (!imageUrls.includes(src)) imageUrls.push(src);
    }
    let likes = 0;
    for (const el of root.querySelectorAll('[aria-label]')) {
      const label = el.getAttribute("aria-label") || "";
      const match = label.match(/(?:Thích|Like):\s*([\d.,]+)\s*(?:người|people)?/i);
      if (match) likes = Number(match[1].replace(/[.,](?=\d{3}\b)/g, "")) || 0;
    }
    const text = (message?.innerText || message?.textContent || "").trim();
    return { text, imageUrls, likes };
  }).catch(() => null);
  if (!data || (!data.text && data.imageUrls.length === 0)) return null;
  return {
    ...fallback,
    pageId: pageInfo.id || fallback.pageId,
    pageName: pageInfo.name || fallback.pageName,
    content: data.text.slice(0, 280),
    fullContent: data.text,
    mediaUrls: data.imageUrls,
    thumbnailUrls: data.imageUrls.slice(0, 4),
    fullPicture: data.imageUrls[0] || "",
    mediaType: data.imageUrls.length > 1 ? "carousel" : data.imageUrls.length === 1 ? "photo" : "text",
    likes: data.likes,
    comments: 0,
    shares: 0,
    rawData: { source: "permalink-dom", feedPriority: -1 },
  };
}

function mergeGraphqlAndDomPosts(graphqlPosts, domPosts, pageSlug, hydratedAlbums = new Map()) {
  const merged = [];
  const seen = new Set();
  const belongsToPage = (post) => {
    if (!pageSlug) return true;
    const permalink = (post.permalink || "").toLowerCase();
    if (permalink.includes(`/${pageSlug}/`)) return true;
    // Reel permalinks omit the page slug. GraphQL ownership is the
    // reliable attribution signal for these.
    return /\/reel\//i.test(permalink) && Boolean(post.pageId || post.pageName);
  };

  for (const post of hydratedAlbums.values()) {
    merged.push(post);
    seen.add(post.permalink);
  }

  for (const graphPost of graphqlPosts.values()) {
    if (!belongsToPage(graphPost)) continue;
    const domPost = domPosts.get(graphPost.permalink) ||
      Array.from(domPosts.values()).find((post) => {
        const domId = String(post.id || "").replace(/^posts_/i, "");
        return domId && domId === String(graphPost.id || "");
      });
    const post = domPost ? {
      ...domPost,
      ...graphPost,
      fullContent: graphPost.fullContent || domPost.fullContent,
      content: graphPost.content || domPost.content,
      mediaUrls: graphPost.mediaUrls.length ? graphPost.mediaUrls : domPost.mediaUrls,
      videoUrls: graphPost.videoUrls.length ? graphPost.videoUrls : domPost.videoUrls,
      thumbnailUrls: graphPost.thumbnailUrls.length ? graphPost.thumbnailUrls : domPost.thumbnailUrls,
      fullPicture: graphPost.fullPicture || domPost.fullPicture,
      likes: graphPost.likes || domPost.likes,
      comments: graphPost.comments || domPost.comments,
      shares: graphPost.shares || domPost.shares,
    } : graphPost;
    const duplicateIndex = merged.findIndex((candidate) => sameLogicalPost(candidate, post));
    if (duplicateIndex >= 0) {
      merged[duplicateIndex] = mergeDuplicatePosts(merged[duplicateIndex], post);
      seen.add(post.permalink);
      continue;
    }
    merged.push(post);
    seen.add(post.permalink);
  }
  for (const post of domPosts.values()) {
    const domId = String(post.id || "").replace(/^posts_/i, "");
    const hydrated = merged.some((candidate) => String(candidate.id || "") === domId);
    if (!hydrated && !seen.has(post.permalink) && !/^posts_\d+$/i.test(post.id || "")) {
      merged.push(post);
    }
  }
  return merged;
}

function sameLogicalPost(a, b) {
  if (!a || !b) return false;
  if (a.permalink && b.permalink && a.permalink === b.permalink) return true;
  const aId = String(a.id || "").replace(/^posts_/i, "");
  const bId = String(b.id || "").replace(/^posts_/i, "");
  if (aId && bId && aId === bId) return true;
  const aText = textSignature(a);
  const bText = textSignature(b);
  return aText.length >= 40 && aText === bText;
}

function textSignature(post) {
  return String(post.fullContent || post.content || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

function hasRealDate(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) && t > 0;
}

function mergeDuplicatePosts(existing, incoming) {
  return {
    ...existing,
    postedAt: hasRealDate(existing.postedAt) ? existing.postedAt : incoming.postedAt,
    likes: incoming.likes || existing.likes,
    comments: incoming.comments || existing.comments,
    shares: incoming.shares || existing.shares,
    reactionIcons: incoming.reactionIcons?.length ? incoming.reactionIcons : existing.reactionIcons,
    rawData: {
      ...(existing.rawData || {}),
      duplicateSource: incoming.rawData?.source || incoming.rawData?.graphQLTypename || "graphql",
    },
  };
}

module.exports = { scrapePage, mergeGraphqlAndDomPosts, extractVisibleFeedPosts, extractPermalinkPost };
