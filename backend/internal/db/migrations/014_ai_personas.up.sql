-- 014_ai_personas.up.sql
-- Standalone AI persona table so multiple pages can share the same
-- trained persona. A persona bundles system prompt, few-shot examples,
-- and post-processor type.

CREATE TABLE facebook.ai_personas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  description        text,
  system_prompt      text NOT NULL,
  few_shot_examples  text,
  post_processor_type text NOT NULL DEFAULT 'generic'
                         CHECK (post_processor_type IN ('generic', 'ecohome')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_personas_name_idx ON facebook.ai_personas (name);

-- Insert the built-in EcoHome persona so existing logic can reference it.
INSERT INTO facebook.ai_personas (id, name, description, system_prompt, few_shot_examples, post_processor_type)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'EcoHome — Trường Mầm Non',
  'Persona chuyên tư vấn thiết kế & thi công trường mầm non EcoHome.',
  'Bạn là nhân viên chat Messenger của EcoHome...',
  '',
  'ecohome'
);
