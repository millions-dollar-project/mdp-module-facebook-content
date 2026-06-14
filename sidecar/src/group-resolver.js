/**
 * Resolve a Facebook group URL to its numeric ID and display name.
 *
 * ID extraction is regex-based (works on any URL shape, no browser).
 * Name extraction opens the URL in a fresh ephemeral headless context
 * and reads og:title / <title> — works for public groups without
 * requiring a logged-in account. For private groups the page is gated
 * and the sidecar returns name: null so the caller can ask the user
 * to fill it manually.
 */
const { chromium } = require("playwright");

// Match a Facebook group URL in any of the common shapes:
//   https://www.facebook.com/groups/1234567890
//   https://www.facebook.com/groups/1234567890/
//   https://www.facebook.com/groups/1234567890/permalink/123/
//   https://m.facebook.com/groups/1234567890
//   https://facebook.com/groups/1234567890/about
const GROUP_URL_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/groups\/([0-9]+)(?:[\/?#]|$)/i;

// Facebook numeric group IDs are 5+ digits in practice.
const NUMERIC_GROUP_ID_RE = /^[0-9]{5,}$/;

/**
 * Parse a Facebook group URL and return the numeric ID, or null if the
 * input isn't a recognisable group URL. Pure function — no I/O.
 */
function parseGroupUrl(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(GROUP_URL_RE);
  if (!m) return null;
  const id = m[1];
  if (!NUMERIC_GROUP_ID_RE.test(id)) return null;
  return { groupId: id, canonicalUrl: `https://www.facebook.com/groups/${id}/` };
}

/**
 * Open the URL in a fresh headless context and try to read the group
 * name from the page title. Returns null if the page is gated or
 * doesn't expose a name. The caller should fall back to asking the
 * user to type the name.
 */
async function fetchGroupNameFromPage(url) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = ctx.pages()[0] || (await ctx.newPage());
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
      // Try og:title first (cleanest), then the rendered h1, then <title>.
      const name = await page
        .evaluate(() => {
          const og = document.querySelector('meta[property="og:title"]');
          if (og && og.content) return og.content;
          const h1 = document.querySelector("h1");
          if (h1 && h1.textContent) return h1.textContent.trim();
          if (document.title) return document.title;
          return null;
        })
        .catch(() => null);
      if (!name) return null;
      // Strip trailing "| Facebook" / "| Meta" / " - Facebook" etc.
      const cleaned = String(name)
        .replace(/\s*[|\-–]\s*(Facebook|Meta)\s*$/i, "")
        .trim();
      return cleaned || null;
    } finally {
      await ctx.close().catch(() => {});
    }
  } catch (e) {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}

/**
 * Resolve a group URL to {groupId, name}. ID is always returned when
 * the URL is well-formed; name is best-effort.
 */
async function resolveGroupMeta(input, _opts = {}) {
  const parsed = parseGroupUrl(input);
  if (!parsed) {
    return {
      ok: false,
      error: "URL không đúng định dạng nhóm Facebook (vd: https://www.facebook.com/groups/1234567890)",
    };
  }
  let name = null;
  try {
    name = await fetchGroupNameFromPage(parsed.canonicalUrl);
  } catch (e) {
    // Non-fatal — we still have the ID.
    name = null;
  }
  return {
    ok: true,
    groupId: parsed.groupId,
    canonicalUrl: parsed.canonicalUrl,
    name,
  };
}

module.exports = { parseGroupUrl, fetchGroupNameFromPage, resolveGroupMeta };
