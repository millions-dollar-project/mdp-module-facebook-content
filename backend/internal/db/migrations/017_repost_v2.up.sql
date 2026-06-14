-- 016_repost_v2.up.sql
-- Repost V2 schema tweaks for the SCA port.
--
-- Changes:
--   1. crawled_posts.page_id is now freeform text (not FK to pages).
--      The crawler can harvest posts from pages the user does NOT manage
--      (e.g. a competitor's page). The column is kept so existing indexes
--      and queries continue to work.
--   2. New account_login_sessions table tracks per-account Playwright
--      visible-browser login flow. The plugin uses it to poll login
--      status and persist the resulting cookies/profile path.
--   3. repost_jobs gains updated_at for queue UI ordering.

-- 1. Drop the FK so crawled posts are no longer tied to a managed page.
ALTER TABLE facebook.crawled_posts
  DROP CONSTRAINT IF EXISTS crawled_posts_page_id_fkey;

-- 2. Manual Playwright login session tracking.
--    status: pending -> running -> completed | failed | expired
--    The sidecar (account-login.js) owns the lifecycle; the Go API is the
--    source of truth that the plugin polls.
CREATE TABLE IF NOT EXISTS facebook.account_login_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES facebook.fb_accounts(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed','expired')),
  started_at      timestamptz,
  completed_at    timestamptz,
  last_error      text,
  profile_path    text,
  cookies_json    jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_login_sessions_account_idx
  ON facebook.account_login_sessions (account_id, created_at DESC);

CREATE INDEX account_login_sessions_status_idx
  ON facebook.account_login_sessions (status, updated_at DESC)
  WHERE status IN ('pending','running');

-- 3. updated_at on repost_jobs for queue UI freshness.
ALTER TABLE facebook.repost_jobs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS repost_jobs_updated_idx
  ON facebook.repost_jobs (updated_at DESC);
