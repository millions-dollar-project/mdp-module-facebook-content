-- 015_pages_ai_persona_id.up.sql
-- Link pages to a shared AI persona.

ALTER TABLE facebook.pages
  ADD COLUMN IF NOT EXISTS ai_persona_id uuid REFERENCES facebook.ai_personas(id) ON DELETE SET NULL;

CREATE INDEX pages_ai_persona_idx ON facebook.pages (ai_persona_id);
