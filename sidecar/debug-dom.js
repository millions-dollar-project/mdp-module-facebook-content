/**
 * Debug script: dump the first post container's raw HTML and probe the
 * selectors we care about (timestamp, like/comment/share, media).
 *
 * Boots the same persistent Chrome context as the scraper, navigates
 * to the page, expands "See more", then evaluates probes on the first
 * detected post.
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const USER_DATA_DIR = process.env.FACEBOOK_CRAWLER_PROFILE || path.join(process.env.APPDATA || ".", ".facebook-crawler-profile");
const URL = process.argv[2] || "https://www.facebook.com/thietketruongmamnonecohome";

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: process.env.CRAWLER_HEADLESS !== "false",
    channel: "chrome",
    pipe: false,
    args: ["--disable-web-security", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = context.pages()[0] || (await context.newPage());
  try {
    console.log(`navigating to ${URL}`);
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3000);
    // Login wall guard
    if (page.url().includes("/login") || page.url().includes("/recover")) {
      throw new Error("login wall — log in first");
    }
    await page.waitForSelector('[role="article"], [data-pagelet="FeedUnit"], [data-testid="post_message"]', { timeout: 15000 }).catch(() => {});

    // Expand See more once
    await page.evaluate(() => {
      document.querySelectorAll('[role="button"], [tabindex="0"], span, div').forEach((el) => {
        const t = (el.getAttribute("aria-label") || el.textContent || "").trim().toLowerCase();
        if (t === "xem thêm" || t === "see more" || t.endsWith("xem thêm") || t.endsWith("see more")) {
          if (t.length < 40 && !t.includes("bình luận") && !t.includes("comment")) el.click();
        }
      });
    });
    await page.waitForTimeout(800);

    // Probe the first feed post
    const probe = await page.evaluate(() => {
      const out = { anchors: [], firstContainer: null, samples: {} };
      const anchors = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"]'));
      out.anchors = anchors.slice(0, 5).map((a) => ({
        href: a.href,
        text: (a.textContent || "").trim().slice(0, 60),
        utime: a.getAttribute("data-utime"),
        ariaLabel: a.getAttribute("aria-label"),
      }));

      // First article-like container
      const article = document.querySelector('[role="article"]');
      if (article) {
        out.firstContainer = {
          tag: article.tagName,
          id: article.id,
          dataTestid: article.getAttribute("data-testid"),
          dataAdPreview: article.getAttribute("data-ad-preview"),
          textSample: (article.innerText || "").slice(0, 1500),
        };

        // Probe for timestamp variants
        out.samples.utimeAnchors = Array.from(article.querySelectorAll('a[data-utime]')).slice(0, 5).map((a) => ({
          href: a.href,
          utime: a.getAttribute("data-utime"),
          text: (a.textContent || "").trim().slice(0, 80),
        }));
        out.samples.timeEls = Array.from(article.querySelectorAll('time[datetime]')).slice(0, 5).map((t) => ({
          datetime: t.getAttribute("datetime"),
          text: (t.textContent || "").trim(),
          parent: t.parentElement?.tagName + " " + ((t.parentElement?.getAttribute("aria-label")) || t.parentElement?.textContent?.trim().slice(0, 60) || ""),
        }));
        out.samples.relativeTimeTexts = Array.from(article.querySelectorAll("a, span, time"))
          .map((el) => (el.textContent || "").trim())
          .filter((t) => /\d+\s*(s|m|h|d|w|giây|phút|giờ|ngày|tuần|tháng|năm|sec|min|hour|day|week|month|year)/i.test(t))
          .slice(0, 10);
        out.samples.abbrTitles = Array.from(article.querySelectorAll("abbr[title], [title*='/']")).slice(0, 5).map((a) => ({
          title: a.getAttribute("title"),
          text: (a.textContent || "").trim().slice(0, 80),
          tag: a.tagName,
        }));

        // Probe for like/comment/share — FB usually renders aria-labels
        out.samples.reactionAriaLabels = Array.from(article.querySelectorAll('[aria-label]'))
          .map((el) => el.getAttribute("aria-label"))
          .filter((l) => l && /(thích|like|love|wow|reaction|bình luận|comment|chia sẻ|share|phản ứng|cảm xúc)/i.test(l))
          .slice(0, 15);
        // Spans with reaction counts near the bottom
        out.samples.reactionSpans = Array.from(article.querySelectorAll("span"))
          .map((el) => ({ text: (el.textContent || "").trim(), aria: el.getAttribute("aria-label") }))
          .filter((x) => /^[\d.,]+[KkMm]?$/.test(x.text) || /\d+\s*(reaction|like|comment|share|thích|bình luận|chia sẻ|phản ứng)/i.test(x.text + " " + (x.aria || "")))
          .slice(0, 20);

        // Media probes
        out.samples.images = Array.from(article.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]'))
          .slice(0, 5)
          .map((i) => ({ src: i.src, alt: (i.alt || "").slice(0, 60), w: i.naturalWidth, h: i.naturalHeight }));
        out.samples.videos = Array.from(article.querySelectorAll("video")).slice(0, 3).map((v) => ({
          src: v.src || v.querySelector("source")?.src,
          poster: v.poster,
          attrs: Array.from(v.attributes).map((a) => `${a.name}="${a.value.slice(0, 80)}"`),
        }));
        out.samples.videoLinks = Array.from(article.querySelectorAll('a[href*="/videos/"], a[href*="/reel/"]'))
          .slice(0, 5)
          .map((a) => a.href);

        // Look for comment/share counts — FB uses several patterns:
        //   - "1K comments" / "1K shares" standalone text
        //   - aria-label="Comment: 1" / "1 comment" / "View 1 comment"
        //   - "N reaction(s)" toolbar near action buttons
        out.samples.commentShareTexts = Array.from(article.querySelectorAll("span, a, div"))
          .map((el) => (el.textContent || "").trim())
          .filter((t) => /^[\d,.]+[KkMm]?\s*(comment|share|bình luận|chia sẻ|lượt chia sẻ)\b/i.test(t))
          .slice(0, 10);
        out.samples.commentShareAria = Array.from(article.querySelectorAll('[aria-label]'))
          .map((el) => el.getAttribute("aria-label"))
          .filter((l) => l && /(comment|share|bình luận|chia sẻ)/i.test(l))
          .slice(0, 10);
        // All button-ish elements
        out.samples.actionButtonTexts = Array.from(article.querySelectorAll('[role="button"], [role="link"]'))
          .map((el) => ({ text: (el.textContent || "").trim().slice(0, 40), aria: el.getAttribute("aria-label") }))
          .filter((x) => /like|comment|share|thích|chia sẻ|bình luận/i.test((x.text + " " + (x.aria || "")).toLowerCase()))
          .slice(0, 15);
        // Raw action bar HTML (truncated) for the like/comment/share toolbar
        const toolbar = article.querySelector('[role="toolbar"]') || Array.from(article.querySelectorAll("div, span"))
          .find((el) => /^(Like|Comment|Share)\s*$/i.test((el.textContent || "").trim()) && el.children.length >= 2);
        if (toolbar) {
          out.samples.toolbarHtml = toolbar.outerHTML.slice(0, 2500);
        }
      }
      return out;
    });

    fs.writeFileSync(path.join(__dirname, "debug-dom.json"), JSON.stringify(probe, null, 2));
    console.log("wrote debug-dom.json");
    console.log("anchor count:", probe.anchors.length);
    if (probe.firstContainer) {
      console.log("first container text head:", probe.firstContainer.textSample.slice(0, 400));
    }
    console.log("utime anchors:", probe.samples.utimeAnchors?.length || 0);
    console.log("time[datetime] els:", probe.samples.timeEls?.length || 0);
    console.log("relative texts:", probe.samples.relativeTimeTexts);
    console.log("abbr titles:", probe.samples.abbrTitles);
    console.log("reaction aria-labels:", probe.samples.reactionAriaLabels);
    console.log("reaction spans:", probe.samples.reactionSpans);
    console.log("images:", probe.samples.images?.length);
    console.log("videos:", probe.samples.videos?.length);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
})();
