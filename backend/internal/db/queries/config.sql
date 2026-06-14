-- name: GetConfig :one
-- Singleton row (id = 1). Returns NULL row if missing; caller should
-- fall back to a zero-value config in that case.
SELECT
  id, page_id, page_access_token, publish_mode, default_page_id,
  webhook_verify_token, app_secret,
  ai_model, auto_scheduling_enabled, auto_schedule_times, timezone,
  default_hashtags, enabled_content_tones, custom_content_tones,
  tone_description_overrides,
  kling_enabled, kling_prompt_template, kling_resolution,
  kling_aspect_ratio, kling_output_count, kling_schedule_days,
  kling_reference_page_url,
  kling_video_enabled, kling_video_prompts, kling_video_aspect_ratio,
  kling_video_output_count,
  created_at, updated_at
FROM facebook.config
WHERE id = 1;

-- name: UpsertConfig :one
INSERT INTO facebook.config (
  id, page_id, page_access_token, publish_mode, default_page_id,
  webhook_verify_token, app_secret,
  ai_model, auto_scheduling_enabled, auto_schedule_times, timezone,
  default_hashtags, enabled_content_tones, custom_content_tones,
  tone_description_overrides,
  kling_enabled, kling_prompt_template, kling_resolution,
  kling_aspect_ratio, kling_output_count, kling_schedule_days,
  kling_reference_page_url,
  kling_video_enabled, kling_video_prompts, kling_video_aspect_ratio,
  kling_video_output_count
) VALUES (
  1, $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10,
  $11, $12, $13,
  $14,
  $15, $16, $17,
  $18, $19, $20,
  $21,
  $22, $23, $24,
  $25
)
ON CONFLICT (id) DO UPDATE SET
  page_id = EXCLUDED.page_id,
  page_access_token = EXCLUDED.page_access_token,
  publish_mode = EXCLUDED.publish_mode,
  default_page_id = EXCLUDED.default_page_id,
  webhook_verify_token = EXCLUDED.webhook_verify_token,
  app_secret = EXCLUDED.app_secret,
  ai_model = EXCLUDED.ai_model,
  auto_scheduling_enabled = EXCLUDED.auto_scheduling_enabled,
  auto_schedule_times = EXCLUDED.auto_schedule_times,
  timezone = EXCLUDED.timezone,
  default_hashtags = EXCLUDED.default_hashtags,
  enabled_content_tones = EXCLUDED.enabled_content_tones,
  custom_content_tones = EXCLUDED.custom_content_tones,
  tone_description_overrides = EXCLUDED.tone_description_overrides,
  kling_enabled = EXCLUDED.kling_enabled,
  kling_prompt_template = EXCLUDED.kling_prompt_template,
  kling_resolution = EXCLUDED.kling_resolution,
  kling_aspect_ratio = EXCLUDED.kling_aspect_ratio,
  kling_output_count = EXCLUDED.kling_output_count,
  kling_schedule_days = EXCLUDED.kling_schedule_days,
  kling_reference_page_url = EXCLUDED.kling_reference_page_url,
  kling_video_enabled = EXCLUDED.kling_video_enabled,
  kling_video_prompts = EXCLUDED.kling_video_prompts,
  kling_video_aspect_ratio = EXCLUDED.kling_video_aspect_ratio,
  kling_video_output_count = EXCLUDED.kling_video_output_count,
  updated_at = now()
RETURNING
  id, page_id, page_access_token, publish_mode, default_page_id,
  webhook_verify_token, app_secret,
  ai_model, auto_scheduling_enabled, auto_schedule_times, timezone,
  default_hashtags, enabled_content_tones, custom_content_tones,
  tone_description_overrides,
  kling_enabled, kling_prompt_template, kling_resolution,
  kling_aspect_ratio, kling_output_count, kling_schedule_days,
  kling_reference_page_url,
  kling_video_enabled, kling_video_prompts, kling_video_aspect_ratio,
  kling_video_output_count,
  created_at, updated_at;
