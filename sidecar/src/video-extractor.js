/**
 * Pure helpers for detecting + extracting video URLs from a crawled
 * Facebook post container.
 *
 * Kept in its own module so it can be unit-tested without spinning up
 * a Playwright browser. The DOM-aware glue lives in scraper.js; this
 * module only operates on strings/JSON.
 *
 * Sources of video URLs we look for, in priority order:
 *   1. The post's `<video>` / `<source>` element `src` (played or
 *      scrolled into view → real .mp4/.webm/.m3u8 URL).
 *   2. The `data-store` or `data-ft` JSON Facebook embeds on every
 *      feed post. This carries `playable_url`,
 *      `browser_native_sd_url`, `browser_native_hd_url`,
 *      `playable_url_quality_hd` and similar fields. Works even when
 *      the player hasn't rendered yet, which is the common case for
 *      posts on the second page of the feed.
 *
 * Reels specifically also expose the video URL via the post
 * permalink's `/reel/<id>/` path, which is what `isVideoPermalink`
 * tests.
 */

// Match a literal video file extension (mp4/webm/m3u8/mpd). We also
// accept Facebook's "playback?" redirect and the `/video/` path
// segment so HLS streams and lazy videos don't slip through.
const VIDEO_FILE_RE = /\.(?:mp4|webm|m3u8|mpd)(?:\?|$|:)/i;
const VIDEO_HINT_RE = /(?:\/video\b|playback\?|\/reel\/)/i;

// Field names inside data-store / data-ft JSON that point at a video
// file. We deliberately do NOT match `url` or `permalink` — those are
// usually the post's own permalink (jpg/png redirect), not the video.
const PLAYABLE_FIELD_RE = /(?:^|_)(playable_url(?:_quality_hd)?|browser_native_(?:sd|hd)_url|video_url(?:_quality_hd)?|playback_url|sd_url|hd_url)(?:\b|_|$)/i;

function isVideoUrl(u) {
  if (typeof u !== "string" || u.length === 0) return false;
  // blob: URLs are produced by the in-page player — always a video.
  if (u.startsWith("blob:")) return true;
  return VIDEO_FILE_RE.test(u) || VIDEO_HINT_RE.test(u);
}

function isVideoPermalink(permalink) {
  if (typeof permalink !== "string" || permalink.length === 0) return false;
  return /\/reel\/|\/videos?\//i.test(permalink);
}

/**
 * Walk an arbitrary JSON value and collect any string that lives at a
 * key matching PLAYABLE_FIELD_RE. The walk is shallow on purpose: we
 * only descend into the video object, not the whole post tree (which
 * contains thousands of unrelated strings).
 *
 * @param {unknown} node
 * @param {string[]} out
 * @returns {string[]}
 */
function collectFromJson(node, out) {
  if (!node) return out;
  if (typeof node === "string") {
    if (isVideoUrl(node)) out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectFromJson(x, out);
    return out;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && PLAYABLE_FIELD_RE.test(k)) {
        if (isVideoUrl(v)) out.push(v);
      } else if (v && typeof v === "object") {
        collectFromJson(v, out);
      }
    }
  }
  return out;
}

/**
 * Extract video URLs from a Facebook data-store or data-ft JSON blob.
 * Returns a deduped, source-order array. Invalid JSON returns [].
 *
 * @param {string|null|undefined} jsonString
 * @returns {string[]}
 */
function extractVideoUrlsFromJson(jsonString) {
  if (typeof jsonString !== "string" || jsonString.length === 0) return [];
  let obj;
  try {
    obj = JSON.parse(jsonString);
  } catch {
    return [];
  }
  const out = collectFromJson(obj, []);
  // Dedup, keep first occurrence (source order).
  const seen = new Set();
  return out.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

/**
 * Extract video URLs from the raw `outerHTML` of a post container.
 * Catches `<video src="…">` and `<source src="…">` elements. Used as
 * a fallback for posts where data-store has been stripped (rare) but
 * the player element is present.
 *
 * @param {string|null|undefined} htmlString
 * @returns {string[]}
 */
function extractVideoUrlsFromHtml(htmlString) {
  if (typeof htmlString !== "string" || htmlString.length === 0) return [];
  const re = /<(?:video|source)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(htmlString)) !== null) {
    const u = m[1];
    if (!seen.has(u) && isVideoUrl(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

module.exports = {
  isVideoUrl,
  isVideoPermalink,
  extractVideoUrlsFromJson,
  extractVideoUrlsFromHtml,
  // Exported for the DOM-side glue in scraper.js
  VIDEO_FILE_RE,
  VIDEO_HINT_RE,
  PLAYABLE_FIELD_RE,
};
