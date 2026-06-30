-- 028_scheduled_posts_kit_account.up.sql
-- Adds the kit_account_id column to facebook.scheduled_posts and the
-- 'personal' post_type. Personal-profile posts (FB-content's
-- crawl → brain → schedule → Playwright /me flow) do NOT have a
-- Facebook Page; the kit account UUID identifies the Chromium profile
-- the sidecar launches.
--
-- All DDL gated on column / constraint existence so re-runs and the
-- shared-schema reality (FB + FB-content both live in `facebook`) are
-- safe (see memory fb-shared-schema-migration-collision).

-- 1. Add kit_account_id (nullable, no FK — kit accounts live in
--    ~/mdp-data/accounts/, not in this DB).
ALTER TABLE facebook.scheduled_posts
  ADD COLUMN IF NOT EXISTS kit_account_id uuid NULL;

-- 2. Personal posts have no FB Page, so page_id must be nullable.
--    The FK is preserved (rows with a page_id still validate against
--    facebook.pages); personal rows simply leave page_id NULL.
ALTER TABLE facebook.scheduled_posts
  ALTER COLUMN page_id DROP NOT NULL;

-- 3. Extend the post_type CHECK constraint to allow 'personal'.
--    PostgreSQL: drop the old constraint by name, re-add with the new
--    value included. Both steps gated on existence.
ALTER TABLE facebook.scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_post_type_check;

ALTER TABLE facebook.scheduled_posts
  ADD CONSTRAINT scheduled_posts_post_type_check
    CHECK (post_type IN ('text','photo','video','link','carousel','reel','personal'));

-- 4. Partial index — Worker queries for personal rows join on
--    kit_account_id; keep it small by only indexing non-null rows.
CREATE INDEX IF NOT EXISTS scheduled_posts_kit_idx
  ON facebook.scheduled_posts (kit_account_id)
  WHERE kit_account_id IS NOT NULL;