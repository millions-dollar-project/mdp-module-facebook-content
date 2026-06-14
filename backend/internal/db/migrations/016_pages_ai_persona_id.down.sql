-- 015_pages_ai_persona_id.down.sql

ALTER TABLE facebook.pages
  DROP COLUMN IF EXISTS ai_persona_id;
