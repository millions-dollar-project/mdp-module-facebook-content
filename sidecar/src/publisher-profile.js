/**
 * Personal-profile publisher using Playwright.
 *
 * Used by the FB-content crawl → brain → schedule flow (see
 * /profile-post HTTP route). Mirrors publisher.js's group-post flow
 * but targets the user's own timeline (/me) — FB blocks /me/feed via
 * the Graph API for non-page accounts, so we drive the visible
 * composer instead. The kit-account's Chromium profile is the same
 * one used for /account-login/start and the group-post flow.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  FB_COMPOSER_SELECTORS,
  FB_POST_BUTTON_SELECTORS,
  waitForAnySelector,
  findAnySelector,
  fillComposerCaption,
  prepareMediaFiles,
  uploadMediaFiles,
  waitForComposerSubmitted,
} = require("./publisher");

/**
 * Find the permalink of the post we just created on the personal
 * timeline. After the composer submits, the new post appears at the
 * top of the /me feed. We look for the first `article[role="article"]`
 * whose text contains a short fingerprint of the caption; the
 * matching article has an `a[href*="/posts/"]` permalink anchor.
 *
 * The fingerprint is the first ~40 non-whitespace characters; long
 * enough to be unique among the user's last 10 posts, short enough
 * that FB's truncate-mid-render quirks don't drop it.
 */
async function findPersonalPostUrl(page, caption) {
  const fingerprint = (caption || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!fingerprint) {
    return page.url();
  }
  // The newest post is rendered first on /me. We scan the top few
  // articles; if none contain the fingerprint we fall back to page.url()
  // (the user can still find the post via the feed).
  const articles = page.locator('div[role="article"], article');
  const count = Math.min(await articles.count().catch(() => 0), 5);
  for (let i = 0; i < count; i++) {
    const art = articles.nth(i);
    const text = (await art.innerText().catch(() => "")) || "";
    if (text.includes(fingerprint)) {
      const link = await art
        .locator('a[href*="/posts/"], a[href*="/permalink"]')
        .first()
        .getAttribute("href")
        .catch(() => null);
      if (link) {
        return link.startsWith("http") ? link : `https://www.facebook.com${link}`;
      }
    }
  }
  return page.url();
}

/**
 * Post `caption` (and optional media) to the kit-account's own
 * personal timeline. Returns `{success, postUrl?, error?}`.
 *
 * Why /me (not /profile.php or /<user.slug>): /me is the canonical
 * timeline that the browser lands on when the user is logged in,
 * regardless of vanity URL changes. FB keeps the composer on the
 * /me page render so the selectors are identical to the group
 * composer's.
 */
async function postToProfile({ profilePath, caption, mediaUrls = [], headless = true }) {
  if (!profilePath) {
    return { success: false, error: "profilePath is required" };
  }
  if (!caption) {
    return { success: false, error: "caption is required" };
  }
  if (!fs.existsSync(profilePath)) {
    return { success: false, error: `Profile not found: ${profilePath}` };
  }
  const context = await chromium.launchPersistentContext(profilePath, {
    headless,
    viewport: { width: 1280, height: 800 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const tempFiles = [];
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto("https://www.facebook.com/me/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const composer = await waitForAnySelector(page, FB_COMPOSER_SELECTORS, 10000);
    if (!composer) {
      return {
        success: false,
        error: "Composer not found on /me — session may be expired or FB returned a checkpoint",
      };
    }
    await composer.click();

    const dialog = page.locator('[role="dialog"]:visible').last();
    await dialog.waitFor({ state: "visible", timeout: 10000 });

    if (mediaUrls.length > 0) {
      const localMedia = await prepareMediaFiles(mediaUrls);
      tempFiles.push(...localMedia.filter((f) => f.startsWith(os.tmpdir())));
      if (localMedia.length === 0) {
        return { success: false, error: "Failed to download media for posting" };
      }
      const uploaded = await uploadMediaFiles(page, dialog, localMedia);
      if (!uploaded) {
        return { success: false, error: "Media upload dialog not found" };
      }
    }

    const editable = dialog
      .locator('div[contenteditable="true"]:visible, [role="textbox"]:visible')
      .last();
    if (await editable.count().catch(() => 0)) {
      await fillComposerCaption(editable, caption);
    } else {
      await page.keyboard.type(caption, { delay: 1 });
    }
    await page.waitForTimeout(500);

    const postButton = await waitForAnySelector(page, FB_POST_BUTTON_SELECTORS, 5000);
    if (!postButton) {
      return { success: false, error: "Post button not found" };
    }
    await postButton.click();

    const submitted = await waitForComposerSubmitted(page);
    if (!submitted) {
      return { success: false, error: "Could not confirm post submission" };
    }
    return { success: true, postUrl: await findPersonalPostUrl(page, caption) };
  } catch (e) {
    console.error("[publisher-profile] postToProfile error:", e.message);
    return { success: false, error: e.message };
  } finally {
    await context.close().catch(() => {});
    await Promise.all(tempFiles.map((f) => fs.promises.unlink(f).catch(() => {})));
  }
}

module.exports = { postToProfile, findPersonalPostUrl };
