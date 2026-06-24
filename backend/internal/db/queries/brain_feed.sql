-- name: InsertBrainFeed :one
INSERT INTO facebook.brain_feeds (
  crawled_post_id, page_id, page_name, content, media_urls, video_urls,
  thumbnail_urls, full_picture, media_type, likes, comments, shares,
  posted_at, source_url, permalink, status
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11, $12,
  $13, $14, $15, $16
)
ON CONFLICT (crawled_post_id) DO UPDATE SET updated_at = NOW()
RETURNING id, crawled_post_id, page_id, page_name, content, media_urls, video_urls,
          thumbnail_urls, full_picture, media_type, likes, comments, shares,
          posted_at, source_url, permalink, brain_content_id, ingested_at,
          error_message, status, retry_count, created_at, updated_at;

-- name: GetBrainFeedByCrawledPostID :one
SELECT id, crawled_post_id, page_id, page_name, content, media_urls, video_urls,
       thumbnail_urls, full_picture, media_type, likes, comments, shares,
       posted_at, source_url, permalink, brain_content_id, ingested_at,
       error_message, status, retry_count, created_at, updated_at
FROM facebook.brain_feeds
WHERE crawled_post_id = $1;

-- name: GetBrainFeedByID :one
SELECT id, crawled_post_id, page_id, page_name, content, media_urls, video_urls,
       thumbnail_urls, full_picture, media_type, likes, comments, shares,
       posted_at, source_url, permalink, brain_content_id, ingested_at,
       error_message, status, retry_count, created_at, updated_at
FROM facebook.brain_feeds
WHERE id = $1;

-- name: ListBrainFeeds :many
SELECT id, crawled_post_id, page_id, page_name, content, media_urls, video_urls,
       thumbnail_urls, full_picture, media_type, likes, comments, shares,
       posted_at, source_url, permalink, brain_content_id, ingested_at,
       error_message, status, retry_count, created_at, updated_at
FROM facebook.brain_feeds
WHERE
  (sqlc.arg(source_page)::text = '' OR page_id = sqlc.arg(source_page))
  AND (sqlc.arg(from_t)::timestamptz IS NULL OR posted_at >= sqlc.arg(from_t))
  AND (sqlc.arg(to_t)::timestamptz IS NULL OR posted_at <= sqlc.arg(to_t))
  AND (sqlc.arg(status_filter)::text = '' OR status = sqlc.arg(status_filter))
  AND (sqlc.arg(search_q)::text = '' OR content ILIKE '%' || sqlc.arg(search_q) || '%')
ORDER BY posted_at DESC
LIMIT sqlc.arg(page_size) OFFSET sqlc.arg(off);

-- name: CountBrainFeeds :one
SELECT COUNT(*)::bigint
FROM facebook.brain_feeds
WHERE
  (sqlc.arg(source_page)::text = '' OR page_id = sqlc.arg(source_page))
  AND (sqlc.arg(from_t)::timestamptz IS NULL OR posted_at >= sqlc.arg(from_t))
  AND (sqlc.arg(to_t)::timestamptz IS NULL OR posted_at <= sqlc.arg(to_t))
  AND (sqlc.arg(status_filter)::text = '' OR status = sqlc.arg(status_filter))
  AND (sqlc.arg(search_q)::text = '' OR content ILIKE '%' || sqlc.arg(search_q) || '%');

-- name: UpdateBrainFeedBrainID :exec
UPDATE facebook.brain_feeds
SET brain_content_id = $2, status = $3, updated_at = NOW()
WHERE id = $1;

-- name: UpdateBrainFeedStatus :exec
UPDATE facebook.brain_feeds
SET status = $2, error_message = $3, retry_count = retry_count + 1, updated_at = NOW()
WHERE id = $1;

-- name: DeleteBrainFeed :exec
DELETE FROM facebook.brain_feeds WHERE id = $1;

-- name: ListBrainFeedsByIDs :many
SELECT id, crawled_post_id, page_id, page_name, content, media_urls, video_urls,
       thumbnail_urls, full_picture, media_type, likes, comments, shares,
       posted_at, source_url, permalink, brain_content_id, ingested_at,
       error_message, status, retry_count, created_at, updated_at
FROM facebook.brain_feeds
WHERE id = ANY($1::uuid[]);

-- name: InsertBrainDraft :one
INSERT INTO facebook.brain_drafts (
  feed_id, content, provenance_id, validation_status, validation_details, warnings, status
) VALUES (
  $1, $2, $3, $4, $5, $6, $7
)
RETURNING id, feed_id, content, provenance_id, validation_status, validation_details,
          warnings, kanban_job_id, status, created_at, updated_at;

-- name: ListBrainDraftsByFeedIDs :many
SELECT id, feed_id, content, provenance_id, validation_status, validation_details,
       warnings, kanban_job_id, status, created_at, updated_at
FROM facebook.brain_drafts
WHERE feed_id = ANY($1::uuid[])
ORDER BY created_at DESC;

-- name: UpdateBrainDraftKanbanJob :exec
UPDATE facebook.brain_drafts
SET kanban_job_id = $2, status = 'pushed', updated_at = NOW()
WHERE id = $1;

-- name: CountBrainDrafts :one
SELECT COUNT(*)::bigint
FROM facebook.brain_drafts
WHERE ($1::text = '' OR status = $1);
