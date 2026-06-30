/**
 * Facebook group publisher using Playwright.
 * Ports the core logic from SCA's test-publisher.ts.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FB_COMPOSER_SELECTORS = [
  'div[aria-label="Write something..."]',
  'div[aria-label="Create a post"]',
  'div[aria-label*="Viết" i]',
  'div[aria-label*="Tạo bài viết" i]',
  'span:has-text("Write something")',
  'span:has-text("Viết gì đó")',
  'span:has-text("Tạo bài viết")',
];
const FB_POST_BUTTON_SELECTORS = [
  'div[aria-label="Post"]', 'span:has-text("Post"):not([aria-hidden="true"])', 'button:has-text("Post")',
  'div[aria-label="Đăng"]', 'span:has-text("Đăng"):not([aria-hidden="true"])', 'button:has-text("Đăng")',
];
const FB_JOIN_SELECTORS = [
  'div[aria-label="Join group"]', 'div[aria-label="Join Group"]', 'span:has-text("Join group")', 'span:has-text("Join Group")',
  'div[aria-label="Tham gia nhóm"]', 'span:has-text("Tham gia nhóm")',
];
const FB_JOINED_SELECTORS = [
  'div[aria-label="Joined"]', 'span:has-text("Joined")',
  'div[aria-label="Đã tham gia"]', 'span:has-text("Đã tham gia")',
];

// Anonymous-posting toggle. SCA-style: clicking the "Đăng ẩn danh" /
// "Post anonymously" switch in the composer makes the post appear
// under the group's anonymous avatar. The selectors are loose because
// Facebook re-labels the control in every UI refresh.
const FB_ANON_TOGGLE_SELECTORS = [
  'input[type="checkbox"][name="anon_post"]',
  '[data-testid="anonymous-post-toggle"]',
  '[aria-label*="anonymous" i]',
  '[aria-label*="ẩn danh" i]',
  'span:has-text("Post anonymously")',
  'span:has-text("Đăng ẩn danh")',
  'div[role="switch"]',
];

async function ensureAnonymousToggle(page, dialog, enabled) {
  if (!enabled) return;
  // Look for an already-on toggle first.
  for (const sel of FB_ANON_TOGGLE_SELECTORS) {
    const el = await page.$(sel);
    if (!el) continue;
    const checked = await el.getAttribute("aria-checked").catch(() => null)
      ?? await el.isChecked().catch(() => null);
    if (checked === true || checked === "true") return;
    try { await el.click({ timeout: 2000 }); return; } catch { /* try next */ }
  }
  // The toggle may live behind a "..." / "More options" button.
  const more = await page.$('div[aria-label="More options"], [aria-label*="tùy chọn" i], [aria-label*="more" i]');
  if (more) {
    try {
      await more.click();
      await page.waitForTimeout(500);
    } catch { /* ignore */ }
    for (const sel of FB_ANON_TOGGLE_SELECTORS) {
      const el = await page.$(sel);
      if (el) {
        try { await el.click({ timeout: 2000 }); return; } catch { /* try next */ }
      }
    }
  }
  console.warn("[publisher] anonymous toggle not found; posting may not be anonymous");
}

async function waitForAnySelector(page, selectors, timeout = 10000) {
  for (const sel of selectors) {
    try {
      return await page.waitForSelector(sel, { timeout });
    } catch { /* try next */ }
  }
  return null;
}

async function findAnySelector(page, selectors) {
  for (const sel of selectors) {
    try {
      const h = await page.$(sel);
      if (h) return h;
    } catch { /* ignore */ }
  }
  return null;
}

async function downloadMediaFile(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    let ext = ".jpg";
    if (ct.includes("png")) ext = ".png";
    else if (ct.includes("webp")) ext = ".webp";
    else if (ct.includes("gif")) ext = ".gif";
    else if (ct.includes("mp4") || ct.includes("video")) ext = ".mp4";
    else {
      const p = new URL(url).pathname;
      const e = path.extname(p).toLowerCase();
      if (e && e.length <= 6) ext = e;
    }
    const file = path.join(os.tmpdir(), `repost-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return null;
    await fs.promises.writeFile(file, buf);
    return file;
  } catch (e) {
    console.warn("[publisher] downloadMediaFile failed:", e.message);
    return null;
  }
}

async function prepareMediaFiles(mediaUrls = []) {
  const files = [];
  for (const url of mediaUrls) {
    if (!url) continue;
    if (!url.startsWith("http")) {
      if (fs.existsSync(url)) files.push(url);
      continue;
    }
    const dl = await downloadMediaFile(url);
    if (dl) files.push(dl);
  }
  return files;
}

async function uploadMediaFiles(page, dialog, files) {
  const input = dialog.locator('input[type="file"]').last();
  if (await input.count().catch(() => 0)) {
    await input.setInputFiles(files);
    await page.waitForTimeout(2500);
    return true;
  }
  let mediaEntry = await findAnySelector(page, [
    'div[aria-label*="Photo/video" i]', 'div[aria-label*="Ảnh/video" i]',
    'span:has-text("Photo/video")', 'span:has-text("Ảnh/video")',
  ]);
  if (mediaEntry) {
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null);
    await mediaEntry.click().catch(() => {});
    const chooser = await chooserPromise;
    if (chooser) {
      await chooser.setFiles(files);
      await page.waitForTimeout(2500);
      return true;
    }
  }
  return false;
}

async function fillComposerCaption(editable, caption) {
  await editable.click();
  const platform = process.platform;
  await editable.press(platform === "darwin" ? "Meta+A" : "Control+A");
  await editable.press("Backspace");
  await editable.pressSequentially(caption, { delay: 1 });
}

async function waitForComposerSubmitted(page) {
  await page.waitForTimeout(3000);
  const blocking = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
  if (!blocking) return true;
  const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return /posted|đã đăng|dang bai|bài viết của bạn/i.test(bodyText);
}

async function findLatestPostUrl(page, groupId) {
  const href = await page.locator(`a[href*="/groups/${groupId}/posts/"], a[href*="/groups/${groupId}/permalink/"]`).first().getAttribute("href").catch(() => null);
  if (!href) return page.url();
  return href.startsWith("http") ? href : `https://www.facebook.com${href}`;
}

async function postToGroup({ profilePath, groupId, caption, mediaUrls = [], headless = true, anonymousPosting = false }) {
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
    const url = `https://www.facebook.com/groups/${groupId}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const composer = await waitForAnySelector(page, FB_COMPOSER_SELECTORS, 10000);
    if (!composer) {
      return { success: false, error: "Composer not found - group may be locked or account not joined" };
    }
    await composer.click();

    let dialog = page.locator('[role="dialog"]:visible').last();
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

    // Toggle "Post anonymously" if the job requires it. Must happen
    // AFTER the dialog opens and BEFORE we click Post, otherwise the
    // post goes out under the account's real identity.
    if (anonymousPosting) {
      await ensureAnonymousToggle(page, dialog, true);
    }

    let editable = dialog.locator('div[contenteditable="true"]:visible, [role="textbox"]:visible').last();
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
    return { success: true, postUrl: await findLatestPostUrl(page, groupId) };
  } catch (e) {
    console.error("[publisher] postToGroup error:", e.message);
    return { success: false, error: e.message };
  } finally {
    await context.close().catch(() => {});
    await Promise.all(tempFiles.map((f) => fs.promises.unlink(f).catch(() => {})));
  }
}

async function checkGroupAccess({ profilePath, groupId, headless = true }) {
  if (!fs.existsSync(profilePath)) {
    return { joined: null, canPost: false, status: "unknown", error: `Profile not found: ${profilePath}` };
  }
  const context = await chromium.launchPersistentContext(profilePath, {
    headless,
    viewport: { width: 1280, height: 800 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    const url = `https://www.facebook.com/groups/${groupId}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);

    if (await findAnySelector(page, FB_COMPOSER_SELECTORS)) {
      return { joined: true, canPost: true, status: "can_post", url: page.url() };
    }
    if (await findAnySelector(page, FB_JOIN_SELECTORS)) {
      return { joined: false, canPost: false, status: "needs_join", url: page.url() };
    }
    if (await findAnySelector(page, FB_JOINED_SELECTORS)) {
      return { joined: true, canPost: false, status: "no_post_permission", url: page.url() };
    }

    const bodyText = (await page.locator("body").innerText({ timeout: 5000 }).catch(() => "")).toLowerCase();
    if (/join group|tham gia nhóm|answer questions/.test(bodyText)) {
      return { joined: false, canPost: false, status: "needs_join", url: page.url() };
    }
    if (/content isn't available|nội dung này hiện không khả dụng/.test(bodyText)) {
      return { joined: null, canPost: false, status: "unknown", error: "Group unavailable", url: page.url() };
    }

    return { joined: null, canPost: false, status: "unknown", error: "Could not determine permissions", url: page.url() };
  } catch (e) {
    console.error("[publisher] checkGroupAccess error:", e.message);
    return { joined: null, canPost: false, status: "unknown", error: e.message };
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = {
  postToGroup,
  checkGroupAccess,
  // Helpers re-used by the personal-profile publisher
  // (publisher-profile.js). Keeping them exported here avoids a copy
  // of the selector banks + media download/upload plumbing.
  FB_COMPOSER_SELECTORS,
  FB_POST_BUTTON_SELECTORS,
  waitForAnySelector,
  findAnySelector,
  fillComposerCaption,
  prepareMediaFiles,
  uploadMediaFiles,
  waitForComposerSubmitted,
};
