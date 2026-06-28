-- 026_drop_fb_accounts.up.sql
--
-- Phase 6 (FB-content parity): kit-accounts is the source of truth
-- for FB accounts (mdp-kit/go/kit-accounts; on-disk at
-- ~/mdp-data/accounts/<name>/). The fb_accounts Postgres table is no
-- longer read or written; the worker fills repost_jobs.account_id and
-- fb_groups.assigned_account_id with deterministic SHA1-v5 UUIDs
-- derived from kit account names.
--
-- Mirrors mdp-module-facebook's 033 migration but uses FB-content's
-- v1-shape fb_accounts table (no description/profile_url columns —
-- those were added in 023_account_fields, which FB-content never
-- adopted).
--
-- Idempotent.

BEGIN;

ALTER TABLE facebook.repost_jobs
    DROP CONSTRAINT IF EXISTS repost_jobs_account_id_fkey;

ALTER TABLE facebook.fb_groups
    DROP CONSTRAINT IF EXISTS fb_groups_assigned_account_id_fkey;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'facebook' AND tablename = 'account_login_sessions'
    ) THEN
        ALTER TABLE facebook.account_login_sessions
            DROP CONSTRAINT IF EXISTS account_login_sessions_account_id_fkey;
        DROP TABLE facebook.account_login_sessions;
    END IF;
END $$;

TRUNCATE TABLE facebook.repost_jobs;
UPDATE facebook.fb_groups SET assigned_account_id = NULL;

DROP TABLE IF EXISTS facebook.fb_accounts;

COMMIT;