-- 025_brain_feed.down.sql
-- Rollback for brain_feeds and brain_drafts tables.

DROP TABLE IF EXISTS facebook.brain_drafts;
DROP TABLE IF EXISTS facebook.brain_feeds;