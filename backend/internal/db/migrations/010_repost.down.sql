-- 010_repost.down.sql
-- Rollback repost campaign schema.

DROP TABLE IF EXISTS facebook.repost_jobs;
DROP TABLE IF EXISTS facebook.repost_campaigns;
DROP TABLE IF EXISTS facebook.fb_groups;
DROP TABLE IF EXISTS facebook.fb_accounts;
DROP TABLE IF EXISTS facebook.crawled_posts;
