-- name: InsertWebhookEvent :one
INSERT INTO facebook.webhook_events (
  event_type, facebook_entry_id, payload, signature, processed, processed_at, error_message
) VALUES (
  $1, $2, $3, $4, $5, $6, $7
)
RETURNING id, event_type, facebook_entry_id, payload, signature, processed, processed_at, error_message, created_at;

-- name: GetWebhookEvent :one
SELECT
  id, event_type, facebook_entry_id, payload, signature, processed, processed_at, error_message, created_at
FROM facebook.webhook_events
WHERE id = $1;

-- name: MarkWebhookProcessed :exec
UPDATE facebook.webhook_events
SET processed = true,
    processed_at = now(),
    error_message = $2
WHERE id = $1;

-- name: ListUnprocessedWebhookEvents :many
SELECT
  id, event_type, facebook_entry_id, payload, signature, processed, processed_at, error_message, created_at
FROM facebook.webhook_events
WHERE processed = false
ORDER BY created_at ASC
LIMIT $1;
