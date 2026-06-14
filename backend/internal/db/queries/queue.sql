-- name: ListQueue :many
SELECT
  id, page_id, content, image_url, media_urls, source, status,
  trend_id, prompt_template_id, created_at, updated_at
FROM facebook.content_queue
ORDER BY created_at DESC;

-- name: GetQueueItem :one
SELECT
  id, page_id, content, image_url, media_urls, source, status,
  trend_id, prompt_template_id, created_at, updated_at
FROM facebook.content_queue
WHERE id = $1;

-- name: UpdateQueueStatus :one
UPDATE facebook.content_queue
SET status = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, content, image_url, media_urls, source, status,
          trend_id, prompt_template_id, created_at, updated_at;

-- name: UpdateQueueContent :one
-- Used by regenerate-content: replaces the body but keeps status.
UPDATE facebook.content_queue
SET content = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, content, image_url, media_urls, source, status,
          trend_id, prompt_template_id, created_at, updated_at;

-- name: DeleteQueueItem :exec
DELETE FROM facebook.content_queue WHERE id = $1;
