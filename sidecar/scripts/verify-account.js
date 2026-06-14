/**
 * Dump the FULL HTML of the first 2 articles. innerText can be empty
 * for reels whose content lives in shadow DOM / video player.
 */
const { chromium } = require("playwright");
const path = require("path");
const os = require("os");

const PROFILE = path.join(os.homedir(), ".mdp/facebook/profiles/account-1781186037568");
const PAGE_URL = "https://www.facebook.com/thietketruongmamnonecohome";

async function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

(async () => {
  const ctx = await chromium.launchPersistentContext(await expandHome(PROFILE), {
    headless: true,
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(PAGE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  for (let s = 0; s < 10; s++) {
    const hasSkel = await page.evaluate(() => !!document.querySelector('[aria-label="Đang tải…"], [aria-label="Loading…"]'));
    const count = await page.evaluate(() => document.querySelectorAll('[role="article"]').length);
    if (!hasSkel && count >= 2) break;
    await page.waitForTimeout(1500);
  }
  await page.evaluate(() => window.scrollBy(0, 1500));
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('[role="article"]'));
    return articles.slice(0, 4).map((a, i) => ({
      i,
      textLen: (a.innerText || "").length,
      htmlLen: a.outerHTML.length,
      // First 300 chars of HTML, stripped of long src/data attributes
      htmlPreview: a.outerHTML.slice(0, 800).replace(/\s+/g, " ").replace(/data-[a-z]+="[^"]*"/g, 'data-x="..."'),
      anchors: Array.from(a.querySelectorAll("a[href]")).map((e) => {
        try { return new URL(e.href).pathname; } catch { return ""; }
      }).filter((p) => /\/posts\/|\/videos\/|\/reel\//.test(p)).slice(0, 5),
    }));
  });
  result.forEach((r) => {
    console.log(`\n=== article #${r.i} (textLen=${r.textLen} htmlLen=${r.htmlLen}) ===`);
    console.log("anchors:", r.anchors);
    console.log("preview:", r.htmlPreview);
  });
  await ctx.close();
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
