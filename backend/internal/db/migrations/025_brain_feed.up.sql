-- 025_brain_feed.up.sql
-- Adds facebook.brain_feeds and facebook.brain_drafts tables for the
-- Crawl -> Brain Feed -> Kanban pipeline.

CREATE TABLE IF NOT EXISTS facebook.brain_feeds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawled_post_id TEXT NOT NULL,
  page_id         TEXT NOT NULL,
  page_name       TEXT,
  content         TEXT NOT NULL,
  media_urls      JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_urls      JSONB NOT NULL DEFAULT '[]'::jsonb,
  thumbnail_urls  JSONB,
  full_picture    TEXT,
  media_type      TEXT NOT NULL DEFAULT '',
  likes           INTEGER NOT NULL DEFAULT 0,
  comments        INTEGER NOT NULL DEFAULT 0,
  shares          INTEGER NOT NULL DEFAULT 0,
  posted_at       TIMESTAMPTZ NOT NULL,
  source_url      TEXT NOT NULL,
  permalink       TEXT NOT NULL,
  brain_content_id TEXT,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message   TEXT,
  status          TEXT NOT NULL DEFAULT 'ingested' CHECK (status IN
                    ('ingested','ingested_no_brain_id','generated','pushed','failed')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_brain_feed_crawled_post UNIQUE (crawled_post_id)
);

CREATE INDEX IF NOT EXISTS idx_brain_feed_posted_at ON facebook.brain_feeds (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_feed_page_id  ON facebook.brain_feeds (page_id);
CREATE INDEX IF NOT EXISTS idx_brain_feed_status   ON facebook.brain_feeds (status);

CREATE TABLE IF NOT EXISTS facebook.brain_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id         UUID NOT NULL REFERENCES facebook.brain_feeds(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  provenance_id   TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('ok','warning','blocked')),
  validation_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings        JSONB NOT NULL DEFAULT '[]'::jsonb,
  kanban_job_id   TEXT,
  status          TEXT NOT NULL DEFAULT 'generated' CHECK (status IN
                    ('generated','pushed','blocked','failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_draft_feed_id ON facebook.brain_drafts (feed_id);
CREATE INDEX IF NOT EXISTS idx_brain_draft_status  ON facebook.brain_drafts (status);