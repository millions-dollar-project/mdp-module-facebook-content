-- 006_post_history.up.sql
-- Successfully published posts. Used for analytics and the History tab.
-- post_id is the Facebook-side ID; page_id is our local FK.

CREATE TABLE facebook.post_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         text UNIQUE NOT NULL,
  page_id         uuid NOT NULL REFERENCES facebook.pages(id) ON DELETE CASCADE,
  content         text NOT NULL,
  image_url       text,
  media_urls      jsonb NOT NULL DEFAULT '[]'::jsonb,
  post_url        text,
  published_at    timestamptz NOT NULL,
  likes           integer NOT NULL DEFAULT 0,
  comments        integer NOT NULL DEFAULT 0,
  shares          integer NOT NULL DEFAULT 0,
  reach           integer,
  engagement_rate numeric(5,4),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX post_history_page_published_idx
  ON facebook.post_history (page_id, published_at DESC);
