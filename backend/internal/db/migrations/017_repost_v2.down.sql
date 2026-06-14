-- 016_repost_v2.down.sql
-- Rollback repost V2 schema tweaks.

-- 3. updated_at
DROP INDEX IF EXISTS facebook.repost_jobs_updated_idx;
ALTER TABLE facebook.repost_jobs DROP COLUMN IF EXISTS updated_at;

-- 2. account_login_sessions
DROP TABLE IF EXISTS facebook.account_login_sessions;

-- 1. Re-add FK (may fail if any orphaned rows exist; that is the point).
ALTER TABLE facebook.crawled_posts
  ADD CONSTRAINT crawled_posts_page_id_fkey
  FOREIGN KEY (page_id) REFERENCES facebook.pages(page_id) ON DELETE CASCADE;
