-- 011_page_persona.down.sql

ALTER TABLE facebook.pages
  DROP COLUMN IF EXISTS ai_role,
  DROP COLUMN IF EXISTS ai_industry,
  DROP COLUMN IF EXISTS ai_tone,
  DROP COLUMN IF EXISTS ai_price_list,
  DROP COLUMN IF EXISTS ai_location_info,
  DROP COLUMN IF EXISTS ai_contact_channel,
  DROP COLUMN IF EXISTS ai_extra_rules,
  DROP COLUMN IF EXISTS ai_system_prompt;
