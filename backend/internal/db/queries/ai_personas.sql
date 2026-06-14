-- name: ListAIPersonas :many
SELECT id, name, description, system_prompt, few_shot_examples, post_processor_type, created_at, updated_at
FROM facebook.ai_personas
ORDER BY updated_at DESC;

-- name: GetAIPersona :one
SELECT id, name, description, system_prompt, few_shot_examples, post_processor_type, created_at, updated_at
FROM facebook.ai_personas
WHERE id = $1;

-- name: CreateAIPersona :one
INSERT INTO facebook.ai_personas (name, description, system_prompt, few_shot_examples, post_processor_type)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, name, description, system_prompt, few_shot_examples, post_processor_type, created_at, updated_at;

-- name: UpdateAIPersona :one
UPDATE facebook.ai_personas
SET name = $2,
    description = $3,
    system_prompt = $4,
    few_shot_examples = $5,
    post_processor_type = $6,
    updated_at = now()
WHERE id = $1
RETURNING id, name, description, system_prompt, few_shot_examples, post_processor_type, created_at, updated_at;

-- name: DeleteAIPersona :exec
DELETE FROM facebook.ai_personas WHERE id = $1;

-- name: UpdatePageAIPersona :one
UPDATE facebook.pages
SET ai_persona_id = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, page_name, page_access_token, category, is_active,
          posting_enabled, ai_enabled, last_active_at, avatar_url, created_at, updated_at,
          ai_role, ai_industry, ai_tone, ai_price_list, ai_location_info,
          ai_contact_channel, ai_extra_rules, ai_system_prompt, ai_persona_id;
