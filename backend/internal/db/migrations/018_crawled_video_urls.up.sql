-- 018_crawled_video_urls.up.sql
-- Persist the video URLs the sidecar extracts so they survive a
-- page reload (before this migration, video posts were correctly
-- tagged with media_type='video' but the actual <video src=…> links
-- were dropped — the plugin then had no way to render the player).
ALTER TABLE facebook.crawled_posts
  ADD COLUMN IF NOT EXISTS video_urls jsonb NOT NULL DEFAULT '[]';
