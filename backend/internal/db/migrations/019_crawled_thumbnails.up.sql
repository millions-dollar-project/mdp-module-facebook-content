-- 019_crawled_thumbnails.up.sql
-- Persist the thumbnail URLs + full_picture the sidecar already
-- extracts, so the plugin can render previews without re-scraping
-- the source page. Mirrors the migration-018 pattern (jsonb, default
-- empty array / empty string).
ALTER TABLE facebook.crawled_posts
  ADD COLUMN IF NOT EXISTS thumbnail_urls jsonb NOT NULL DEFAULT '[]';

ALTER TABLE facebook.crawled_posts
  ADD COLUMN IF NOT EXISTS full_picture text NOT NULL DEFAULT '';
