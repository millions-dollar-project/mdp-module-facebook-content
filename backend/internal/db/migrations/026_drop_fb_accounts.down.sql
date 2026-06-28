-- 026_drop_fb_accounts.down.sql
--
-- Phase 6 rollback (FB-content parity with mdp-module-facebook/033).
-- Restores the empty fb_accounts table shape and FK chain. Data is
-- GONE (TRUNCATE in the up migration).

BEGIN;

CREATE TABLE IF NOT EXISTS facebook.fb_accounts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    email         text,
    profile_path  text NOT NULL,
    cookies_json  jsonb,
    status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','banned')),
    last_used_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fb_accounts_profile_path_idx
    ON facebook.fb_accounts (profile_path);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fb_groups_assigned_account_id_fkey'
    ) THEN
        ALTER TABLE facebook.fb_groups
            ADD CONSTRAINT fb_groups_assigned_account_id_fkey
            FOREIGN KEY (assigned_account_id) REFERENCES facebook.fb_accounts(id)
            ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'repost_jobs_account_id_fkey'
    ) THEN
        ALTER TABLE facebook.repost_jobs
            ADD CONSTRAINT repost_jobs_account_id_fkey
            FOREIGN KEY (account_id) REFERENCES facebook.fb_accounts(id)
            ON DELETE CASCADE;
    END IF;
END $$;

COMMIT;