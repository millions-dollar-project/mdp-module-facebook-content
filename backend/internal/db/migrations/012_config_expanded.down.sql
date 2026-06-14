-- 012_config_expanded.down.sql
-- Revert the facebook.config expansion.

ALTER TABLE facebook.config
  DROP COLUMN IF EXISTS ai_model,
  DROP COLUMN IF EXISTS auto_scheduling_enabled,
  DROP COLUMN IF EXISTS auto_schedule_times,
  DROP COLUMN IF EXISTS timezone,
  DROP COLUMN IF EXISTS default_hashtags,
  DROP COLUMN IF EXISTS enabled_content_tones,
  DROP COLUMN IF EXISTS custom_content_tones,
  DROP COLUMN IF EXISTS tone_description_overrides,
  DROP COLUMN IF EXISTS kling_enabled,
  DROP COLUMN IF EXISTS kling_prompt_template,
  DROP COLUMN IF EXISTS kling_resolution,
  DROP COLUMN IF EXISTS kling_aspect_ratio,
  DROP COLUMN IF EXISTS kling_output_count,
  DROP COLUMN IF EXISTS kling_schedule_days,
  DROP COLUMN IF EXISTS kling_reference_page_url,
  DROP COLUMN IF EXISTS kling_video_enabled,
  DROP COLUMN IF EXISTS kling_video_prompts,
  DROP COLUMN IF EXISTS kling_video_aspect_ratio,
  DROP COLUMN IF EXISTS kling_video_output_count;
