-- 018_crawled_video_urls.down.sql
ALTER TABLE facebook.crawled_posts
  DROP COLUMN IF EXISTS video_urls;
