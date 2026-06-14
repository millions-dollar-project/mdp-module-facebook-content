-- 019_crawled_thumbnails.down.sql
ALTER TABLE facebook.crawled_posts DROP COLUMN IF EXISTS full_picture;
ALTER TABLE facebook.crawled_posts DROP COLUMN IF EXISTS thumbnail_urls;
