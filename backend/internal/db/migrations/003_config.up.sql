-- 003_config.up.sql
-- Singleton row (id = 1) holding app-level config. app_secret is stored
-- server-side only and MUST NEVER be returned via the API (handler strips
-- it before serialising).

CREATE TABLE facebook.config (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  page_id              text,
  page_access_token    text,
  publish_mode         text NOT NULL DEFAULT 'review'
                         CHECK (publish_mode IN ('auto', 'review')),
  default_page_id      text,
  webhook_verify_token text,
  app_secret           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

INSERT INTO facebook.config (id) VALUES (1) ON CONFLICT DO NOTHING;
