-- 011_page_persona.up.sql
-- Add AI persona columns to facebook.pages so each page can have its own
-- vertical (mầm non, xây dựng, spa, …), tone, price list, and rules.

ALTER TABLE facebook.pages
  ADD COLUMN IF NOT EXISTS ai_role           text DEFAULT 'tư vấn viên tuyển sinh',
  ADD COLUMN IF NOT EXISTS ai_industry       text DEFAULT 'giáo dục mầm non',
  ADD COLUMN IF NOT EXISTS ai_tone           text DEFAULT 'thân thiện, vui vẻ, không quá trang trọng, dùng emoji vừa phải',
  ADD COLUMN IF NOT EXISTS ai_price_list     text,
  ADD COLUMN IF NOT EXISTS ai_location_info  text,
  ADD COLUMN IF NOT EXISTS ai_contact_channel text,
  ADD COLUMN IF NOT EXISTS ai_extra_rules    text,
  ADD COLUMN IF NOT EXISTS ai_system_prompt  text;  -- full override, nullable
