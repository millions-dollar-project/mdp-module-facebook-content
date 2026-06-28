/**
 * Manual Playwright login flow for FB accounts that have been banned
 * from automated posting or that need a fresh, browser-confirmed login.
 *
 * Flow:
 *   1. startLogin({ profilePath, email, password, timeoutMs })
 *      - Launches a *visible* Chromium with a persistent context
 *        pointed at `profilePath` (so cookies survive across runs).
 *        `~/...` in profilePath is expanded against os.homedir() so
 *        the same default works on Linux and Windows.
 *      - Navigates to facebook.com/login.
 *      - Pre-fills the email (identifier) field.
 *      - If `password` is non-empty, types it and submits. The browser
 *        is still left visible so a 2FA / checkpoint challenge can be
 *        cleared by hand. We don't try to fully automate the login —
 *        fresh FB sessions almost always hit a checkpoint.
 *      - Returns immediately with { sessionId, status: "running" }.
 *      - Awaits a successful login in the background and emits a
 *        status update via the callback registered by registerSession.
 *   2. checkSession(sessionId) -> { status, profilePath, lastError }
 *      - Returns the latest status recorded by the session callbacks.
 *   3. cancelSession(sessionId) -> closes the visible browser early.
 *
 * The plugin pairs startLogin with a long-poll on checkSession and
 * surfaces "Đang chờ bạn đăng nhập trong trình duyệt..." to the user.
 */
const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

/** Expand a leading "~/" or "~" in p against os.homedir(). */
function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

// sessionId -> { status, profilePath, lastError, updatedAt, _browser, _page }
const sessions = new Map();

function newSessionId() {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Launch a visible browser at facebook.com/login pointed at the given
 * persistent profile. Updates the session's status as the flow progresses.
 *
 * Resolves with { sessionId, status: "running" } so the HTTP handler can
 * return immediately; the actual login wait happens in the background.
 *
 * If `name` is supplied (kit-accounts account name), the sidecar will
 * persist a fresh meta.json + appstate.json under
 * `~/mdp-data/accounts/<name>/` once the URL leaves /login.
 */
async function startLogin({
  profilePath,
  email = null,
  password = null,
  name = null,
  timeoutMs = 10 * 60 * 1000,
} = {}) {
  if (!profilePath) {
    throw new Error("profilePath required");
  }
  const expandedPath = expandHome(profilePath);
  const sessionId = newSessionId();
  const session = {
    status: "pending",
    profilePath: expandedPath,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
  sessions.set(sessionId, session);

  // Run the wait in the background. Errors update the session row.
  _runLoginFlow(sessionId, session, {
    profilePath: expandedPath,
    email,
    password,
    name,
    timeoutMs,
  })
    .catch((e) => {
      session.status = "failed";
      session.lastError = e && e.message ? e.message : String(e);
      session.updatedAt = new Date().toISOString();
    });

  return { sessionId, status: "running" };
}

async function _runLoginFlow(sessionId, session, opts) {
  let browser = null;
  try {
    session.status = "running";
    session.updatedAt = new Date().toISOString();

    browser = await chromium.launchPersistentContext(opts.profilePath, {
      headless: false, // visible — the user is logging in
      viewport: { width: 1280, height: 800 },
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    session._browser = browser;

    const page = browser.pages()[0] || (await browser.newPage());
    session._page = page;

    // Pre-fill the email/identifier if provided. The user still types
    // the password and any 2FA code themselves.
    await page.goto("https://www.facebook.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    }).catch(() => null);
    if (opts.email) {
      try {
        await page.fill('input[name="email"]', opts.email).catch(() => null);
      } catch { /* selectors may differ; ignore */ }
    }
    if (opts.password) {
      // Type the password and submit. Even when email+password are
      // provided the browser is left visible so the user can clear
      // a 2FA / checkpoint challenge themselves.
      try {
        await page.fill('input[name="pass"]', opts.password).catch(() => null);
        await Promise.all([
          page
            .click('button[name="login"], button[type="submit"], input[type="submit"]')
            .catch(() => null),
          page
            .waitForLoadState("domcontentloaded", { timeout: 8000 })
            .catch(() => null),
        ]);
      } catch { /* ignore — flow continues, user can still 2FA */ }
    }

    // Wait for the URL to leave /login. If the user closes the window
    // or never finishes, the outer timeout fires.
    const start = Date.now();
    while (Date.now() - start < opts.timeoutMs) {
      await page.waitForTimeout(1500);
      const url = page.url();
      if (url && !/\/login|\/recover|\/checkpoint/i.test(url)) {
        // Persist kit-accounts artifacts BEFORE marking completed so the
        // plugin's poll never observes a completed status with no
        // on-disk account behind it. Failures here abort the success
        // signal — better to keep status=running and let the user
        // retry than to silently lose the freshly-captured cookies.
        if (opts.name) {
          try {
            await persistKitAccount(browser, page, opts.name, opts.profilePath);
          } catch (persistErr) {
            session.status = "failed";
            session.lastError = `persist: ${persistErr && persistErr.message ? persistErr.message : String(persistErr)}`;
            session.updatedAt = new Date().toISOString();
            return;
          }
        }
        session.status = "completed";
        session.updatedAt = new Date().toISOString();
        return;
      }
    }
    throw new Error("Login timeout — please complete the login in the browser before the timer expires.");
  } finally {
    // Close the visible browser once we have a definitive outcome.
    // On success the user has already seen the home feed load; leaving
    // the browser open blocks the next account login (same persistent
    // context) and clutters the user's screen. On failure the
    // error overlay was enough feedback.
    if (session.status === "completed" || session.status === "failed" || session.status === "expired") {
      try { await browser?.close(); } catch { /* ignore */ }
      session._browser = undefined;
    }
  }
}

function checkSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return { status: "expired", lastError: "session not found" };
  return {
    status: s.status,
    profilePath: s.profilePath,
    lastError: s.lastError,
    updatedAt: s.updatedAt,
  };
}

async function cancelSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return { cancelled: false };
  try {
    await s._browser?.close();
  } catch { /* ignore */ }
  s.status = "expired";
  s.updatedAt = new Date().toISOString();
  return { cancelled: true };
}

module.exports = { startLogin, checkSession, cancelSession, expandHome, persistKitAccount };

// ─── Kit-accounts persistence ─────────────────────────────────────────

/**
 * Resolve the kit-accounts root, honoring `MDP_ACCOUNTS_ROOT` if set.
 * Mirrors `mdp-kit/ts/kit-accounts/src/paths.ts::defaultRoot` so the
 * sidecar writes to the same directory the Go handler reads from.
 */
function accountsRoot() {
  const fromEnv = process.env.MDP_ACCOUNTS_ROOT;
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(expandHome(fromEnv));
  }
  return path.resolve(os.homedir(), "mdp-data", "accounts");
}

/**
 * Pull cookies + GraphQL token out of the live browser context and write
 * a kit-accounts bundle under `<root>/<name>/`. The Go handler reads
 * these artifacts when serving `GET /kit-accounts`, so a missing
 * meta.json is what made the dropdown look empty after a fresh login.
 *
 * Writes atomically (write to <name>.tmp, rename) so a crash mid-write
 * never leaves a torn file behind.
 */
async function persistKitAccount(browser, page, name, profilePath) {
  if (!name) throw new Error("name required");
  // browser is the launchPersistentContext return value; its cookies()
  // method returns every cookie visible to the persistent profile.
  const cookies = await browser.cookies();
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error("no cookies captured from browser");
  }

  // Normalize Playwright's cookie shape to match kit CookieSchema:
  //   { name, value, domain, path, expires, httpOnly, secure, sameSite? }
  const normCookies = cookies
    .map((c) => {
      const sameSite = (() => {
        const v = (c.sameSite || "").toString();
        if (/strict/i.test(v)) return "Strict";
        if (/lax/i.test(v)) return "Lax";
        if (/none/i.test(v)) return "None";
        return undefined;
      })();
      const out = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        // default path to "/" so cookies scraped from a feed URL still
        // round-trip cleanly; matches the existing on-disk shape.
        path: c.path || "/",
        // Playwright uses -1 for session cookies — preserve verbatim so
        // kit's isAppStateExpired probe keeps working.
        expires: typeof c.expires === "number" ? c.expires : -1,
        httpOnly: Boolean(c.httpOnly),
        secure: c.secure !== false,
      };
      if (sameSite) out.sameSite = sameSite;
      return out;
    })
    .filter((c) => c.domain && c.name);

  // Extract fb_dtsg + user_id from cookies/HTML so the persisted
  // appstate validates against FacebookAppStateSchema. fb_dtsg is a
  // hidden <input> on most pages; if we can't find it, fall back to a
  // stable-but-empty string — GraphQL endpoints will refresh it on the
  // next request. user_id lives in the c_user cookie.
  const userCookie = normCookies.find((c) => c.name === "c_user");
  const userId = userCookie ? userCookie.value : null;
  if (!userId) {
    throw new Error("c_user cookie missing — login did not complete");
  }
  let fbDtsg = "";
  try {
    const html = await page.content().catch(() => "");
    const m = /"token":"([^"]+)"/.exec(html) || /name="fb_dtsg" value="([^"]+)"/.exec(html);
    if (m) fbDtsg = m[1];
  } catch { /* ignore — leave empty */ }

  const nowIso = new Date().toISOString();
  const meta = {
    name,
    status: "active",
    createdAt: nowIso,
    lastUsedAt: null,
    lastHealthCheck: null,
    healthStatus: "healthy",
    tags: [],
    profilePath: profilePath ? expandHome(profilePath) : undefined,
  };
  const appState = {
    platform: "facebook",
    cookies: normCookies,
    fb_dtsg: fbDtsg,
    user_id: userId,
    captured_at: nowIso,
    source: "login",
  };
  const proxy = { type: "none" };

  const root = accountsRoot();
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteJson(path.join(dir, "meta.json"), meta);
  atomicWriteJson(path.join(dir, "appstate.json"), appState);
  atomicWriteJson(path.join(dir, "proxy.json"), proxy);
  refreshIndex(root, meta);
}

/**
 * Atomic JSON write: write to <p>.tmp then rename. Mirrors
 * `mdp-kit/ts/kit-accounts/src/fs.ts::writeJsonAtomic` so the on-disk
 * shape matches what the TS registry produces.
 */
function atomicWriteJson(p, obj) {
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

/**
 * Read-modify-write `<root>/index.json` so the new account shows up in
 * `GET /kit-accounts` without a registry rebuild. If the index is
 * missing or corrupt, write a fresh one.
 */
function refreshIndex(root, meta) {
  const indexPath = path.join(root, "index.json");
  let idx = { version: 1, generatedAt: new Date().toISOString(), accounts: [] };
  try {
    const raw = fs.readFileSync(indexPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.accounts)) idx = parsed;
  } catch { /* fresh index */ }

  const summary = {
    name: meta.name,
    platform: meta.platform || "facebook",
    status: meta.status,
    healthStatus: meta.healthStatus,
    lastUsedAt: meta.lastUsedAt,
  };
  const i = idx.accounts.findIndex((a) => a.name === meta.name);
  if (i >= 0) idx.accounts[i] = summary;
  else idx.accounts.push(summary);
  idx.accounts.sort((a, b) => a.name.localeCompare(b.name));
  idx.generatedAt = new Date().toISOString();
  atomicWriteJson(indexPath, idx);
}
