-- name: ListMessages :many
SELECT
  id, conversation_id, sender_id, sender_type, content, message_type,
  is_from_page, is_ai_generated, is_read, sent_at, created_at
FROM facebook.messages
WHERE conversation_id = $1
ORDER BY sent_at DESC
LIMIT $2;

-- name: InsertMessage :exec
INSERT INTO facebook.messages (
  id, conversation_id, sender_id, sender_type, content, message_type,
  is_from_page, is_ai_generated, is_read, sent_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
ON CONFLICT (id) DO NOTHING;

-- name: HasAIReplied :one
SELECT EXISTS(
  SELECT 1 FROM facebook.ai_replied WHERE inbound_message_id = $1
) AS has_replied;

-- name: GetMessage :one
SELECT
  id, conversation_id, sender_id, sender_type, content, message_type,
  is_from_page, is_ai_generated, is_read, sent_at, created_at
FROM facebook.messages
WHERE id = $1;

-- name: CountAITurns :one
SELECT COUNT(*) AS ai_turn_count
FROM facebook.messages
WHERE conversation_id = $1 AND is_ai_generated = true;
