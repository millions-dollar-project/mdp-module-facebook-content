-- 004_content_queue.up.sql
-- AI-generated or manual post drafts awaiting human review.
-- status flow: NEW -> DRAFTING -> REVIEW -> READY -> PUBLISHED
--                        \-> REJECTED   /

CREATE TABLE facebook.content_queue (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id             uuid REFERENCES facebook.pages(id) ON DELETE SET NULL,
  content             text NOT NULL,
  image_url           text,
  media_urls          jsonb NOT NULL DEFAULT '[]'::jsonb,
  source              text NOT NULL
                        CHECK (source IN ('manual', 'ai', 'repost', 'campaign')),
  status              text NOT NULL
                        CHECK (status IN ('NEW', 'DRAFTING', 'REVIEW', 'READY', 'PUBLISHED', 'REJECTED')),
  trend_id            text,
  prompt_template_id  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_queue_status_idx ON facebook.content_queue (status, created_at DESC);
