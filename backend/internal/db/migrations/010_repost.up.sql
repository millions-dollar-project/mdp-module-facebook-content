-- 010_repost.up.sql
-- Repost campaign schema: crawl -> spin -> schedule -> group post.
-- Supports multi-account posting to 100+ groups with per-job tracking.

-- Crawled posts from source pages (viral content pool)
CREATE TABLE facebook.crawled_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         text NOT NULL REFERENCES facebook.pages(page_id) ON DELETE CASCADE,
  source_url      text NOT NULL,
  fb_post_id      text,
  content         text,
  media_urls      jsonb NOT NULL DEFAULT '[]',
  media_type      text NOT NULL DEFAULT 'text' CHECK (media_type IN ('text','photo','video','carousel','link')),
  likes           int NOT NULL DEFAULT 0,
  comments        int NOT NULL DEFAULT 0,
  shares          int NOT NULL DEFAULT 0,
  posted_at       timestamptz,
  permalink       text,
  is_selected     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crawled_posts_page_id_idx ON facebook.crawled_posts (page_id, created_at DESC);
CREATE INDEX crawled_posts_selected_idx ON facebook.crawled_posts (page_id, is_selected) WHERE is_selected = true;

-- Facebook user accounts (for Playwright group posting)
CREATE TABLE facebook.fb_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text,
  profile_path    text NOT NULL,        -- Playwright persistent profile dir
  cookies_json    jsonb,               -- optional serialized cookies
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','banned')),
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX fb_accounts_profile_path_idx ON facebook.fb_accounts (profile_path);

-- Facebook groups assigned to accounts
CREATE TABLE facebook.fb_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        text NOT NULL,
  name            text,
  assigned_account_id uuid REFERENCES facebook.fb_accounts(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','removed')),
  last_posted_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX fb_groups_group_id_idx ON facebook.fb_groups (group_id);
CREATE INDEX fb_groups_account_idx ON facebook.fb_groups (assigned_account_id, status);

-- Repost campaigns (one source post -> many groups)
CREATE TABLE facebook.repost_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  source_post_url text NOT NULL,
  source_post_text text NOT NULL,
  source_post_media_urls jsonb NOT NULL DEFAULT '[]',
  caption_style   text NOT NULL DEFAULT 'friendly',
  scheduled_at    timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','expired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  last_error      text
);

CREATE INDEX repost_campaigns_status_scheduled_idx ON facebook.repost_campaigns (status, scheduled_at);
CREATE INDEX repost_campaigns_due_idx ON facebook.repost_campaigns (scheduled_at) WHERE status = 'pending';

-- Individual posting jobs (campaign x account x group)
CREATE TABLE facebook.repost_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES facebook.repost_campaigns(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES facebook.fb_accounts(id) ON DELETE CASCADE,
  group_id        text NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','expired')),
  attempts        int NOT NULL DEFAULT 0,
  last_error      text,
  post_url        text,
  scheduled_at    timestamptz,
  anonymous_posting boolean NOT NULL DEFAULT false,
  auto_enabled    boolean NOT NULL DEFAULT false,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX repost_jobs_campaign_idx ON facebook.repost_jobs (campaign_id, status);
CREATE INDEX repost_jobs_account_idx ON facebook.repost_jobs (account_id, status);
CREATE INDEX repost_jobs_due_idx ON facebook.repost_jobs (scheduled_at, status) WHERE status = 'pending' AND scheduled_at IS NOT NULL;
