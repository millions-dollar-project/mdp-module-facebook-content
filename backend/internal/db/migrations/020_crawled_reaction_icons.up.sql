-- 020_crawled_reaction_icons.up.sql
-- Persist the colored reaction emoji image URLs the sidecar pulls
-- from the "See who reacted to this" toolbar. Mirrors 019 (jsonb
-- with empty-array default). Display-only — likes count is still
-- the source of truth for the FE number badge.
ALTER TABLE facebook.crawled_posts
  ADD COLUMN IF NOT EXISTS reaction_icons jsonb NOT NULL DEFAULT '[]';
