-- 005_scheduled_posts.up.sql
-- Posts scheduled for future publication. The background worker polls
-- rows with status='SCHEDULED' AND scheduled_at <= now() each tick.

CREATE TABLE facebook.scheduled_posts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id               uuid NOT NULL REFERENCES facebook.pages(id) ON DELETE CASCADE,
  content               text NOT NULL,
  image_url             text,
  media_urls            jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                text NOT NULL
                          CHECK (status IN ('SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED')),
  scheduled_at          timestamptz NOT NULL,
  post_type             text NOT NULL DEFAULT 'text'
                          CHECK (post_type IN ('text', 'photo', 'video', 'link', 'carousel', 'reel')),
  trend_reference       text,
  ai_generated          boolean NOT NULL DEFAULT false,
  engagement_prediction jsonb,
  campaign_id           text,                 -- FK to campaigns (Phase 3)
  facebook_post_id      text,                 -- set after publish succeeds
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Partial index keeps the worker query fast even when history grows large.
CREATE INDEX scheduled_posts_due_idx
  ON facebook.scheduled_posts (scheduled_at)
  WHERE status = 'SCHEDULED';
