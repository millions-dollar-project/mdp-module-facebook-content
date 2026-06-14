/**
 * MDP Facebook Sidecar
 * HTTP micro-service for Playwright automation:
 *   POST /crawl                 - scrape posts from a Facebook page
 *   POST /group-resolve         - parse a group URL into id + name
 *   POST /group-check           - check if account can post to group
 *   POST /group-post            - post to a Facebook group
 *   POST /account-login/start   - launch visible browser for manual login
 *   GET  /account-login/status  - poll status of a login session
 *   POST /account-login/cancel  - close the visible browser early
 *   POST /kling/generate        - generate images/videos on kling.ai
 *
 * Runs on port 9001 by default (env SIDECAR_PORT).
 */
const express = require("express");
const cors = require("cors");
const { scrapePage } = require("./scraper");
const { checkGroupAccess, postToGroup } = require("./publisher");
const { startLogin, checkSession, cancelSession } = require("./account-login");
const { generateKlingImages, generateKlingVideos } = require("./kling");
const { resolveGroupMeta } = require("./group-resolver");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.SIDECAR_PORT || 9001;

// Health
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ─── Crawl ───────────────────────────────────────────────────────────
app.post("/crawl", async (req, res) => {
  const {
    pageUrl,
    limit = 10,
    headless = true,
    profilePath = null,
    untilDate = null,
  } = req.body;
  if (!pageUrl) return res.status(400).json({ error: "pageUrl required" });
  try {
    const posts = await scrapePage(pageUrl, {
      limit,
      headless,
      profilePath,
      untilDate,
    });
    res.json({ success: true, posts });
  } catch (err) {
    console.error("[crawl]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Group Resolve ───────────────────────────────────────────────────
app.post("/group-resolve", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });
  try {
    const out = await resolveGroupMeta(url);
    if (!out.ok) {
      return res.status(400).json({ success: false, error: out.error });
    }
    res.json({
      success: true,
      groupId: out.groupId,
      canonicalUrl: out.canonicalUrl,
      name: out.name,
    });
  } catch (err) {
    console.error("[group-resolve]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Group Check ─────────────────────────────────────────────────────
app.post("/group-check", async (req, res) => {
  const { profilePath, groupId, headless = true } = req.body;
  if (!profilePath || !groupId) {
    return res.status(400).json({ error: "profilePath and groupId required" });
  }
  try {
    const result = await checkGroupAccess({ profilePath, groupId, headless });
    res.json({ success: true, result });
  } catch (err) {
    console.error("[group-check]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Group Post ──────────────────────────────────────────────────────
app.post("/group-post", async (req, res) => {
  const { profilePath, groupId, caption, mediaUrls, headless = true, anonymousPosting = false } = req.body;
  if (!profilePath || !groupId || !caption) {
    return res.status(400).json({ error: "profilePath, groupId, caption required" });
  }
  try {
    const result = await postToGroup({ profilePath, groupId, caption, mediaUrls, headless, anonymousPosting });
    res.json({ success: true, result });
  } catch (err) {
    console.error("[group-post]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Kling Generate ──────────────────────────────────────────────────
app.post("/kling/generate", async (req, res) => {
  const { prompt, count = 1, type = "image", options = {}, headless = false } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  try {
    let paths;
    if (type === "video") {
      paths = await generateKlingVideos(prompt, count, options, headless);
    } else {
      paths = await generateKlingImages(prompt, count, options, headless);
    }
    res.json({ success: true, paths });
  } catch (err) {
    console.error("[kling]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Account Login (manual Playwright flow) ──────────────────────────
app.post("/account-login/start", async (req, res) => {
  const { profilePath, email, password, timeoutMs } = req.body;
  if (!profilePath) return res.status(400).json({ error: "profilePath required" });
  try {
    const out = await startLogin({ profilePath, email, password, timeoutMs });
    res.json({ success: true, ...out });
  } catch (err) {
    console.error("[account-login/start]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/account-login/status", (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  res.json({ success: true, ...checkSession(String(sessionId)) });
});

app.post("/account-login/cancel", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  res.json({ success: true, ...(await cancelSession(String(sessionId))) });
});

app.listen(PORT, () => {
  console.log(`[sidecar] Listening on http://localhost:${PORT}`);
});
