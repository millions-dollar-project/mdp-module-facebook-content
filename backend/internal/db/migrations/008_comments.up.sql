-- 008_comments.up.sql
-- Facebook post comments and replies. Supports auto-like, auto-reply,
-- private message tracking, and atomic claim locking.

CREATE TABLE facebook.comments (
  id                  text PRIMARY KEY,       -- Facebook comment ID
  post_id             text NOT NULL,
  page_id             uuid NOT NULL REFERENCES facebook.pages(id) ON DELETE CASCADE,
  from_id             text,
  from_name           text NOT NULL DEFAULT 'Khách ẩn danh',
  message             text NOT NULL,
  created_time        timestamptz,
  like_count          integer NOT NULL DEFAULT 0,
  reply_count         integer NOT NULL DEFAULT 0,
  sentiment           text NOT NULL DEFAULT 'neutral'
                          CHECK (sentiment IN ('positive', 'neutral', 'negative', 'very_negative')),
  intent              text NOT NULL DEFAULT 'other'
                          CHECK (intent IN ('interested', 'asking_price', 'complaint', 'general', 'spam', 'other')),
  priority            integer NOT NULL DEFAULT 50,
  is_hidden           boolean NOT NULL DEFAULT false,
  is_liked            boolean NOT NULL DEFAULT false,
  is_private_reply_sent boolean NOT NULL DEFAULT false,
  collected_info      jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at         timestamptz NOT NULL DEFAULT now(),
  claimed_at          timestamptz,
  claimed_by          text,                   -- process ID or instance marker
  processed           boolean NOT NULL DEFAULT false
);

CREATE INDEX comments_page_post_idx
  ON facebook.comments (page_id, post_id, received_at DESC);

CREATE INDEX comments_unprocessed_idx
  ON facebook.comments (page_id, received_at)
  WHERE processed = false;

CREATE TABLE facebook.comment_replies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id    text NOT NULL REFERENCES facebook.comments(id) ON DELETE CASCADE,
  reply_type    text NOT NULL
                    CHECK (reply_type IN ('public', 'private')),
  content       text NOT NULL,
  sent_by       text NOT NULL DEFAULT 'AI'
                    CHECK (sent_by IN ('AI', 'ADMIN')),
  status        text NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('sent', 'failed', 'pending')),
  facebook_reply_id text,
  sent_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comment_replies_comment_idx
  ON facebook.comment_replies (comment_id, sent_at DESC);

-- Atomic claim function helper: ensures only one worker/instance processes a comment.
CREATE OR REPLACE FUNCTION facebook.claim_comment(
  p_comment_id text,
  p_claimed_by text
) RETURNS boolean AS $$
BEGIN
  UPDATE facebook.comments
  SET claimed_at = now(), claimed_by = p_claimed_by
  WHERE id = p_comment_id
    AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes');
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
