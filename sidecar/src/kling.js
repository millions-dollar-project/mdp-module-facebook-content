/**
 * Simplified Kling.ai automation using Playwright.
 * Ports the core image/video generation from SCA's kling-playwright-service.ts.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const USER_DATA_DIR = process.env.KLING_PROFILE || path.join(process.env.APPDATA || ".", "kling-profile");
const DOWNLOAD_DIR = process.env.KLING_DOWNLOAD_DIR || path.join(process.env.APPDATA || ".", "generated-images");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function launchContext(headless = false) {
  ensureDir(USER_DATA_DIR);
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    channel: "chrome",
    args: [
      "--disable-web-security",
      "--remote-debugging-port=9222",
      "--disable-session-crashed-bubble",
      "--disable-features=RestoreSession",
      "--restore-last-session=false",
      "--noerrdialogs",
      "--no-sandbox",
    ],
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return ctx;
}

async function findWorkingPage(ctx) {
  const pages = ctx.pages().filter((p) => {
    try { return !p.isClosed(); } catch { return false; }
  });
  const onKling = pages.find((p) => {
    try { return p.url().includes("kling.ai"); } catch { return false; }
  });
  if (onKling) return onKling;
  const blank = pages.find((p) => {
    try { return p.url() === "about:blank"; } catch { return false; }
  });
  if (blank) return blank;
  return await ctx.newPage();
}

async function isLoggedIn(page) {
  try {
    return await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return (
        !!document.querySelector('[class*="avatar" i], [class*="user" i], img[alt*="user" i], [class*="profile" i]') ||
        text.includes("My Assets") || text.includes("User Guide") || text.includes("Plans") || text.includes("Omni")
      );
    });
  } catch { return false; }
}

async function waitForLogin(page, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) return true;
    await page.waitForTimeout(3000);
  }
  return false;
}

async function generateKlingImages(prompt, count = 1, options = {}, headless = false) {
  ensureDir(DOWNLOAD_DIR);
  const todayDir = path.join(DOWNLOAD_DIR, new Date().toISOString().slice(0, 10));
  ensureDir(todayDir);

  const ctx = await launchContext(headless);
  try {
    const page = await findWorkingPage(ctx);
    await page.goto("https://kling.ai/app/omni/new?model=image", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    if (!(await isLoggedIn(page))) {
      const logged = await waitForLogin(page);
      if (!logged) throw new Error("Kling login timeout - please log in manually");
    }

    // Dismiss popups
    await page.evaluate(() => {
      document.querySelectorAll('button[aria-label="Close"], .close-button').forEach((b) => b.click());
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    // Click Image Generation tab if present
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button, div[role="tab"]')) {
        if (btn.textContent?.includes("Image Generation")) { btn.click(); return true; }
      }
      return false;
    }).catch(() => {});
    await page.waitForTimeout(800);

    // Fill prompt
    const filled = await page.evaluate((text) => {
      for (const ta of document.querySelectorAll("textarea")) {
        if (ta.getBoundingClientRect().width > 100) {
          ta.value = text;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
      }
      for (const div of document.querySelectorAll('div[contenteditable="true"]')) {
        if (div.getBoundingClientRect().width > 100) {
          div.textContent = text;
          div.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
      }
      return false;
    }, prompt);
    if (!filled) throw new Error("Could not find prompt textarea on Kling");

    // Configure settings
    const settingsClicked = await page.evaluate(() => {
      const bar = document.querySelector('.setting-select');
      if (bar) { bar.click(); return true; }
      for (const el of document.querySelectorAll('div, button, span')) {
        const t = el.textContent?.trim() || '';
        if (t.length > 5 && t.length < 30 && t.includes('HD') && t.includes('Auto')) { el.click(); return true; }
      }
      return false;
    });
    if (settingsClicked) await page.waitForTimeout(1000);

    // Click output count
    await page.evaluate((cnt) => {
      for (const popper of document.querySelectorAll('.el-popper')) {
        if (!popper.textContent?.includes('Mode')) continue;
        for (const el of popper.querySelectorAll('div, span, button, li')) {
          if (el.textContent?.trim() === String(cnt)) { el.click(); return true; }
        }
      }
      return false;
    }, Math.min(count, 4)).catch(() => {});
    await page.waitForTimeout(400);

    // Close popup
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await page.waitForTimeout(400);

    // Click Generate
    const genClicked = await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button')) {
        const t = btn.textContent?.toLowerCase() || '';
        if (t.includes('generate') && t.length < 30) { btn.click(); return true; }
      }
      return false;
    });
    if (!genClicked) throw new Error("Generate button not found on Kling");

    const generationStartedAt = Date.now();
    const timeoutMs = 180000;
    const saved = [];

    // Wait and poll for images
    await page.waitForTimeout(15000);
    for (let attempt = 0; attempt < 36; attempt++) {
      if (Date.now() - generationStartedAt > timeoutMs) break;
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      const candidates = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        const isUI = (src, cls, alt) => {
          const s = (src || "").toLowerCase();
          for (const p of ['logo','watermark','icon','avatar','badge','brand','ui-','nav','header','toolbar','lighting','poster','guide','omni-designer','kling-website','banner','background','decoration','overlay','placeholder','dummy','spinner','loading','skeleton','empty','error','fallback']) {
            if (s.includes(p) || (cls || "").toLowerCase().includes(p) || (alt || "").toLowerCase().includes(p)) return true;
          }
          return false;
        };
        const add = (src, el) => {
          if (!src || seen.has(src)) return;
          const r = el.getBoundingClientRect();
          if (r.width < 200 || r.height < 200) return;
          if (isUI(src, el.className, el.getAttribute("alt"))) return;
          let inGen = false, p = el.parentElement;
          for (let i = 0; i < 6 && p; i++) {
            if ((p.textContent || "").toLowerCase().includes("generated")) { inGen = true; break; }
            p = p.parentElement;
          }
          seen.add(src);
          out.push({ src, area: r.width * r.height, inGen });
        };
        for (const img of document.querySelectorAll("img")) {
          add(img.getAttribute("src") || img.getAttribute("data-src"), img);
        }
        for (const div of document.querySelectorAll("div")) {
          const bg = getComputedStyle(div).backgroundImage;
          if (bg && bg.startsWith("url(")) add(bg.slice(5, -2).replace(/["']/g, ""), div);
        }
        return out.sort((a, b) => (b.inGen - a.inGen) || (b.area - a.area));
      });

      for (const c of candidates) {
        if (saved.length >= count) break;
        const ext = /\.jpe?g/i.test(c.src) ? "jpg" : /\.webp/i.test(c.src) ? "webp" : "png";
        const fp = path.join(todayDir, `kling_${Date.now()}_${saved.length}.${ext}`);
        try {
          if (c.src.startsWith("data:image")) {
            const b64 = c.src.split(",")[1];
            if (b64) fs.writeFileSync(fp, Buffer.from(b64, "base64"));
          } else if (c.src.startsWith("blob:")) {
            const b64 = await page.evaluate(async (blobUrl) => {
              const resp = await fetch(blobUrl);
              const blob = await resp.blob();
              return new Promise((resolve) => {
                const r = new FileReader();
                r.onloadend = () => resolve(r.result.split(",")[1] || "");
                r.readAsDataURL(blob);
              });
            }, c.src);
            if (b64) fs.writeFileSync(fp, Buffer.from(b64, "base64"));
          } else {
            const response = await page.context().request.get(c.src);
            if (response.ok()) {
              const buf = await response.body();
              fs.writeFileSync(fp, buf);
            }
          }
          const st = fs.statSync(fp);
          if (st.size > 4000) {
            const buf = fs.readFileSync(fp);
            const isPng = buf[0] === 0x89 && buf[1] === 0x50;
            const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
            const isWebp = buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
            if (isPng || isJpeg || isWebp) saved.push(fp);
          }
        } catch (e) {
          console.warn("[kling] download failed:", e.message);
        }
      }
      if (saved.length >= count) break;
      await page.waitForTimeout(5000);
    }
    return saved.slice(0, count);
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function generateKlingVideos(prompt, count = 1, options = {}, headless = false) {
  ensureDir(DOWNLOAD_DIR);
  const todayDir = path.join(DOWNLOAD_DIR, new Date().toISOString().slice(0, 10));
  ensureDir(todayDir);

  const ctx = await launchContext(headless);
  try {
    const page = await findWorkingPage(ctx);
    await page.goto("https://kling.ai/app/omni/new?model=video", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    if (!(await isLoggedIn(page))) {
      const logged = await waitForLogin(page);
      if (!logged) throw new Error("Kling login timeout - please log in manually");
    }

    // Dismiss popups
    await page.evaluate(() => {
      document.querySelectorAll('button[aria-label="Close"], .close-button').forEach((b) => b.click());
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    // Click Video Generation tab
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button, div[role="tab"]')) {
        if (btn.textContent?.includes("Video Generation")) { btn.click(); return true; }
      }
      return false;
    }).catch(() => {});
    await page.waitForTimeout(800);

    // Fill prompt
    const filled = await page.evaluate((text) => {
      for (const ta of document.querySelectorAll("textarea")) {
        if (ta.getBoundingClientRect().width > 100) {
          ta.value = text;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
      }
      for (const div of document.querySelectorAll('div[contenteditable="true"]')) {
        if (div.getBoundingClientRect().width > 100) {
          div.textContent = text;
          div.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
      }
      return false;
    }, prompt);
    if (!filled) throw new Error("Could not find prompt textarea for video");

    // Click Generate
    const genClicked = await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button')) {
        const t = btn.textContent?.toLowerCase() || '';
        if (t.includes('generate') && t.length < 30) { btn.click(); return true; }
      }
      return false;
    });
    if (!genClicked) throw new Error("Generate button not found for video");

    const saved = [];
    await page.waitForTimeout(20000);
    for (let attempt = 0; attempt < 24; attempt++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      const candidates = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        const add = (src, el) => {
          if (!src || seen.has(src)) return;
          const r = el.getBoundingClientRect();
          if (r.width < 200 || r.height < 200) return;
          let inGen = false, p = el.parentElement;
          for (let i = 0; i < 6 && p; i++) {
            if ((p.textContent || "").toLowerCase().includes("generated")) { inGen = true; break; }
            p = p.parentElement;
          }
          seen.add(src);
          out.push({ src, area: r.width * r.height, inGen });
        };
        for (const v of document.querySelectorAll("video")) {
          add(v.getAttribute("src") || v.querySelector("source")?.getAttribute("src") || "", v);
        }
        for (const img of document.querySelectorAll("img")) {
          const s = img.getAttribute("src") || "";
          if (s.includes(".mp4") || s.includes(".webm") || s.includes("video")) add(s, img);
        }
        return out.sort((a, b) => (b.inGen - a.inGen) || (b.area - a.area));
      });

      for (const c of candidates.slice(0, count)) {
        const fp = path.join(todayDir, `kling_video_${Date.now()}_${saved.length}.mp4`);
        try {
          if (c.src.startsWith("blob:")) {
            const b64 = await page.evaluate(async (blobUrl) => {
              const resp = await fetch(blobUrl);
              const blob = await resp.blob();
              return new Promise((resolve) => {
                const r = new FileReader();
                r.onloadend = () => resolve(r.result.split(",")[1] || "");
                r.readAsDataURL(blob);
              });
            }, c.src);
            if (b64) fs.writeFileSync(fp, Buffer.from(b64, "base64"));
          } else {
            const response = await page.context().request.get(c.src);
            if (response.ok()) fs.writeFileSync(fp, await response.body());
          }
          if (fs.existsSync(fp) && fs.statSync(fp).size > 4000) saved.push(fp);
        } catch (e) {
          console.warn("[kling] video download failed:", e.message);
        }
      }
      if (saved.length >= count) break;
      await page.waitForTimeout(5000);
    }
    return saved.slice(0, count);
  } finally {
    await ctx.close().catch(() => {});
  }
}

module.exports = { generateKlingImages, generateKlingVideos };
