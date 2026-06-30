-- 027_brain_drafts_persona.up.sql
-- Adds persona_id to facebook.brain_drafts so the Kanban tab can show
-- which AI model produced each draft (used by FB-content's crawl →
-- brain → schedule → Playwright auto-publish flow).
--
-- Gated on column existence: FB + FB-content share the `facebook`
-- Postgres schema (see memory fb-shared-schema-migration-collision),
-- so this migration may run on a DB where a prior backfill or sibling
-- module already created the column.

ALTER TABLE facebook.brain_drafts
  ADD COLUMN IF NOT EXISTS persona_id text NOT NULL DEFAULT '';