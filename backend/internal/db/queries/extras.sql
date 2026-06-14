-- Prompt Templates
-- name: ListPromptTemplates :many
SELECT id, name, category, prompt_text, variables_json, description, is_active, supported_tones, created_at, updated_at
FROM facebook.prompt_templates
WHERE category = $1 OR $1 = ''
ORDER BY updated_at DESC;

-- name: GetPromptTemplate :one
SELECT id, name, category, prompt_text, variables_json, description, is_active, supported_tones, created_at, updated_at
FROM facebook.prompt_templates
WHERE id = $1;

-- name: CreatePromptTemplate :one
INSERT INTO facebook.prompt_templates (
  id, name, category, prompt_text, variables_json, description, is_active, supported_tones
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, name, category, prompt_text, variables_json, description, is_active, supported_tones, created_at, updated_at;

-- name: UpdatePromptTemplate :one
UPDATE facebook.prompt_templates
SET name = $2,
    category = $3,
    prompt_text = $4,
    variables_json = $5,
    description = $6,
    is_active = $7,
    supported_tones = $8,
    updated_at = now()
WHERE id = $1
RETURNING id, name, category, prompt_text, variables_json, description, is_active, supported_tones, created_at, updated_at;

-- name: DeletePromptTemplate :exec
DELETE FROM facebook.prompt_templates WHERE id = $1;

-- Hashtag Bank
-- name: ListHashtags :many
SELECT tag, category, created_at
FROM facebook.hashtag_bank
ORDER BY created_at DESC;

-- name: AddHashtag :one
INSERT INTO facebook.hashtag_bank (tag, category)
VALUES ($1, $2)
ON CONFLICT (tag) DO UPDATE SET category = EXCLUDED.category
RETURNING tag, category, created_at;

-- name: DeleteHashtag :exec
DELETE FROM facebook.hashtag_bank WHERE tag = $1;

-- Video Config (singleton)
-- name: GetVideoConfig :one
SELECT id, watermark_type, watermark_text, watermark_image_path, updated_at
FROM facebook.video_config
WHERE id = 1;

-- name: UpsertVideoConfig :one
INSERT INTO facebook.video_config (
  id, watermark_type, watermark_text, watermark_image_path
) VALUES (1, $1, $2, $3)
ON CONFLICT (id) DO UPDATE SET
  watermark_type = EXCLUDED.watermark_type,
  watermark_text = EXCLUDED.watermark_text,
  watermark_image_path = EXCLUDED.watermark_image_path,
  updated_at = now()
RETURNING id, watermark_type, watermark_text, watermark_image_path, updated_at;
