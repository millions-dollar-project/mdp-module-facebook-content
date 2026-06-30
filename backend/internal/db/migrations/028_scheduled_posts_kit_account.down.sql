-- 028_scheduled_posts_kit_account.down.sql
-- Reverse migration. Refuses to drop page_id NOT NULL if any personal
-- rows exist (they would lose their anchor), so the DBA has to clean
-- them first.

DROP INDEX IF EXISTS facebook.scheduled_posts_kit_idx;

ALTER TABLE facebook.scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_post_type_check;

ALTER TABLE facebook.scheduled_posts
  ADD CONSTRAINT scheduled_posts_post_type_check
    CHECK (post_type IN ('text','photo','video','link','carousel','reel'));

-- Re-apply NOT NULL only if no personal rows remain.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM facebook.scheduled_posts
    WHERE page_id IS NULL OR post_type = 'personal'
  ) THEN
    ALTER TABLE facebook.scheduled_posts
      ALTER COLUMN page_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE facebook.scheduled_posts
  DROP COLUMN IF EXISTS kit_account_id;