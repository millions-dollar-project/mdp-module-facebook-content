-- name: ListPages :many
-- Returns all managed pages ordered by name.
SELECT
  id, page_id, page_name, page_access_token, category, is_active,
  posting_enabled, ai_enabled, last_active_at, avatar_url, created_at, updated_at,
  ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
  ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id
FROM facebook.pages
ORDER BY page_name ASC;

-- name: GetPage :one
SELECT
  id, page_id, page_name, page_access_token, category, is_active,
  posting_enabled, ai_enabled, last_active_at, avatar_url, created_at, updated_at,
  ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
  ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id
FROM facebook.pages
WHERE id = $1;

-- name: GetPageByFBID :one
SELECT
  id, page_id, page_name, page_access_token, category, is_active,
  posting_enabled, ai_enabled, last_active_at, avatar_url, created_at, updated_at,
  ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
  ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id
FROM facebook.pages
WHERE page_id = $1;

-- name: CreatePage :one
INSERT INTO facebook.pages (
  page_id, page_name, page_access_token, category, is_active,
  posting_enabled, ai_enabled, avatar_url,
  ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
  ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8,
  $9, $10, $11, $12, $13, $14, $15, $16, $17
)
RETURNING id, page_id, page_name, page_access_token, category, is_active,
          posting_enabled, ai_enabled, last_active_at, avatar_url, created_at, updated_at,
          ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
          ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id;

-- name: UpdatePage :one
UPDATE facebook.pages
SET page_name = $2,
    page_access_token = $3,
    category = $4,
    is_active = $5,
    posting_enabled = $6,
    ai_enabled = $7,
    avatar_url = $8,
    ai_role = $9,
    ai_industry = $10,
    ai_tone = $11,
    ai_price_list = $12,
    ai_location_info = $13,
    ai_contact_channel = $14,
    ai_extra_rules = $15,
    ai_system_prompt = $16,
    ai_persona_id = $17,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, page_name, page_access_token, category, is_active,
          posting_enabled, ai_enabled, last_active_at, avatar_url, created_at, updated_at,
          ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
          ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id;

-- name: UpdatePagePersona :one
UPDATE facebook.pages
SET ai_role = $2,
    ai_industry = $3,
    ai_tone = $4,
    ai_price_list = $5,
    ai_location_info = $6,
    ai_contact_channel = $7,
    ai_extra_rules = $8,
    ai_system_prompt = $9,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, page_name, page_access_token, category, is_active,
          posting_enabled, ai_enabled, last_active_at, avatar_url, created_at, updated_at,
          ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
          ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id;

-- name: DeletePage :exec
DELETE FROM facebook.pages WHERE id = $1;

-- name: TogglePagePosting :one
UPDATE facebook.pages
SET posting_enabled = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, page_name, page_access_token, category, is_active,
          posting_enabled, ai_enabled, last_active_at, avatar_url, created_at, updated_at,
          ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
          ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id;

-- name: TogglePageAI :one
UPDATE facebook.pages
SET ai_enabled = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, page_name, page_access_token, category, is_active,
          posting_enabled, ai_enabled, last_active_at, avatar_url, created_at, updated_at,
          ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
          ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id;
