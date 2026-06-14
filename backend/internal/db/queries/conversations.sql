-- name: ListConversations :many
SELECT
  id, page_id, customer_id, customer_name, last_message_preview, last_message_time,
  unread_count, status, ai_enabled, contacted, priority_score, conversation_summary,
  collected_info, reset_at, created_at, updated_at
FROM facebook.conversations
WHERE page_id = $1 AND status = 'open'
ORDER BY updated_at DESC
LIMIT $2;

-- name: GetConversation :one
SELECT
  id, page_id, customer_id, customer_name, last_message_preview, last_message_time,
  unread_count, status, ai_enabled, contacted, priority_score, conversation_summary,
  collected_info, reset_at, created_at, updated_at
FROM facebook.conversations
WHERE id = $1;

-- name: GetConversationByCustomer :one
SELECT
  id, page_id, customer_id, customer_name, last_message_preview, last_message_time,
  unread_count, status, ai_enabled, contacted, priority_score, conversation_summary,
  collected_info, reset_at, created_at, updated_at
FROM facebook.conversations
WHERE page_id = $1 AND customer_id = $2;

-- name: CreateConversation :one
INSERT INTO facebook.conversations (
  page_id, customer_id, customer_name, last_message_preview, last_message_time,
  status, ai_enabled, priority_score, collected_info, reset_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
RETURNING
  id, page_id, customer_id, customer_name, last_message_preview, last_message_time,
  unread_count, status, ai_enabled, contacted, priority_score, conversation_summary,
  collected_info, reset_at, created_at, updated_at;

-- name: UpdateConversationPreview :exec
UPDATE facebook.conversations
SET last_message_preview = $2,
    last_message_time = $3,
    unread_count = unread_count + $4,
    updated_at = now()
WHERE id = $1;

-- name: MarkConversationRead :exec
UPDATE facebook.conversations
SET unread_count = 0,
    updated_at = now()
WHERE id = $1;

-- name: ToggleConversationAI :exec
UPDATE facebook.conversations
SET ai_enabled = $2,
    updated_at = now()
WHERE id = $1;

-- name: MarkConversationContacted :exec
UPDATE facebook.conversations
SET contacted = $2,
    updated_at = now()
WHERE id = $1;

-- name: UpdateConversationSummary :exec
UPDATE facebook.conversations
SET conversation_summary = $2,
    collected_info = $3,
    updated_at = now()
WHERE id = $1;

-- name: ResetConversationTurns :exec
UPDATE facebook.conversations
SET reset_at = now(),
    updated_at = now()
WHERE id = $1;

-- name: ScanConversationsNeedingReply :many
-- Finds open conversations updated in the last 24h that have unread messages
-- or were last updated without an AI reply.
SELECT
  id, page_id, customer_id, customer_name, last_message_preview, last_message_time,
  unread_count, status, ai_enabled, contacted, priority_score, conversation_summary,
  collected_info, reset_at, created_at, updated_at
FROM facebook.conversations
WHERE page_id = $1
  AND status = 'open'
  AND ai_enabled = true
  AND (
    unread_count > 0
    OR updated_at > now() - interval '24 hours'
  )
ORDER BY updated_at DESC
LIMIT $2;
