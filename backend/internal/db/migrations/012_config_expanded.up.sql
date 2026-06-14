-- 012_config_expanded.up.sql
-- Expand the singleton facebook.config row with all fields migrated from
-- social-content-automation (SCA) so SettingsPanel / ConfigPanel logic works
-- identically in the module.

ALTER TABLE facebook.config
  ADD COLUMN IF NOT EXISTS ai_model                     text  DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS auto_scheduling_enabled      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_schedule_times          text  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS timezone                     text  DEFAULT 'Asia/Ho_Chi_Minh',
  ADD COLUMN IF NOT EXISTS default_hashtags              text  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS enabled_content_tones          text  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS custom_content_tones         text  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tone_description_overrides     text  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS kling_enabled                 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS kling_prompt_template          text,
  ADD COLUMN IF NOT EXISTS kling_resolution              text  DEFAULT '2K HD',
  ADD COLUMN IF NOT EXISTS kling_aspect_ratio             text  DEFAULT '3:4',
  ADD COLUMN IF NOT EXISTS kling_output_count             integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kling_schedule_days           text  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS kling_reference_page_url       text,
  ADD COLUMN IF NOT EXISTS kling_video_enabled            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS kling_video_prompts            text  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS kling_video_aspect_ratio       text  DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS kling_video_output_count       integer DEFAULT 1;

-- Populate existing row with safe defaults so the UI never sees NULL.
UPDATE facebook.config SET
  ai_model                 = COALESCE(ai_model,                 'openai'),
  auto_scheduling_enabled  = COALESCE(auto_scheduling_enabled,  false),
  auto_schedule_times      = COALESCE(auto_schedule_times,      '[]'),
  timezone                 = COALESCE(timezone,                 'Asia/Ho_Chi_Minh'),
  default_hashtags         = COALESCE(default_hashtags,         '[]'),
  enabled_content_tones    = COALESCE(enabled_content_tones,    '[]'),
  custom_content_tones     = COALESCE(custom_content_tones,     '[]'),
  tone_description_overrides = COALESCE(tone_description_overrides, '{}'),
  kling_enabled            = COALESCE(kling_enabled,            false),
  kling_resolution         = COALESCE(kling_resolution,         '2K HD'),
  kling_aspect_ratio       = COALESCE(kling_aspect_ratio,       '3:4'),
  kling_output_count       = COALESCE(kling_output_count,       1),
  kling_schedule_days      = COALESCE(kling_schedule_days,      '[]'),
  kling_video_enabled      = COALESCE(kling_video_enabled,      false),
  kling_video_prompts      = COALESCE(kling_video_prompts,      '[]'),
  kling_video_aspect_ratio = COALESCE(kling_video_aspect_ratio, '1:1'),
  kling_video_output_count = COALESCE(kling_video_output_count, 1)
WHERE id = 1;
