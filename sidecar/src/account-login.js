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
 */
async function startLogin({ profilePath, email = null, password = null, timeoutMs = 10 * 60 * 1000 } = {}) {
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
  _runLoginFlow(sessionId, session, { profilePath: expandedPath, email, password, timeoutMs })
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
        session.status = "completed";
        session.updatedAt = new Date().toISOString();
        return;
      }
    }
    throw new Error("Login timeout — please complete the login in the browser before the timer expires.");
  } finally {
    // Don't close the browser on success — the user may want to verify
    // they're logged in. The next startLogin for the same profile will
    // reuse the same persistent context. We still keep a reference so
    // cancelSession can close it.
    if (session.status !== "completed") {
      try { await browser?.close(); } catch { /* ignore */ }
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

module.exports = { startLogin, checkSession, cancelSession, expandHome };
