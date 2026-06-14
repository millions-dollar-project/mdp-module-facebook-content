-- 013_prompts_hashtags_video.up.sql
-- Tables migrated from social-content-automation:
--   prompt_templates  — reusable AI prompt library for campaigns
--   hashtag_bank    — global hashtag pool
--   video_config    — singleton watermark / video settings

CREATE TABLE IF NOT EXISTS facebook.prompt_templates (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  category        text NOT NULL DEFAULT 'campaign_content',
  prompt_text     text NOT NULL,
  variables_json  text NOT NULL DEFAULT '[]',
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  supported_tones text NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facebook.hashtag_bank (
  tag       text PRIMARY KEY,
  category  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facebook.video_config (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  watermark_type        text NOT NULL DEFAULT 'none',
  watermark_text        text,
  watermark_image_path  text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO facebook.video_config (id) VALUES (1) ON CONFLICT DO NOTHING;
