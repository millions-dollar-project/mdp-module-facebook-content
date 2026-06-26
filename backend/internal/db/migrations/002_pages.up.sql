-- 002_pages.up.sql
-- Managed Facebook pages registry. One row per page the user has granted
-- a long-lived access token for. Tokens are stored plaintext for now —
-- TODO Phase 3: encrypt at rest with APP_SECRET-derived key.

CREATE TABLE IF NOT EXISTS facebook.pages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id           text UNIQUE NOT NULL,        -- FB page ID (numeric string)
  page_name         text NOT NULL,
  page_access_token text NOT NULL,
  category          text,
  is_active         boolean NOT NULL DEFAULT true,
  posting_enabled   boolean NOT NULL DEFAULT true,
  ai_enabled        boolean NOT NULL DEFAULT false,
  last_active_at    timestamptz,
  avatar_url        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pages_is_active_idx ON facebook.pages (is_active);
