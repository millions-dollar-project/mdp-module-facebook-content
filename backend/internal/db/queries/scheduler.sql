-- name: ListScheduled :many
SELECT
  id, page_id, content, image_url, media_urls, status, scheduled_at,
  post_type, trend_reference, ai_generated, engagement_prediction,
  campaign_id, facebook_post_id, error_message, created_at, updated_at
FROM facebook.scheduled_posts
ORDER BY scheduled_at ASC;

-- name: GetScheduled :one
SELECT
  id, page_id, content, image_url, media_urls, status, scheduled_at,
  post_type, trend_reference, ai_generated, engagement_prediction,
  campaign_id, facebook_post_id, error_message, created_at, updated_at
FROM facebook.scheduled_posts
WHERE id = $1;

-- name: CreateScheduled :one
INSERT INTO facebook.scheduled_posts (
  page_id, content, image_url, media_urls, status, scheduled_at,
  post_type, trend_reference, ai_generated, engagement_prediction, campaign_id
) VALUES (
  $1, $2, $3, $4, 'SCHEDULED', $5,
  $6, $7, $8, $9, $10
)
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, created_at, updated_at;

-- name: MarkSchedulePublishing :one
-- Atomic claim: only succeeds if status is still SCHEDULED.
-- Used by the worker to prevent two workers picking the same row.
UPDATE facebook.scheduled_posts
SET status = 'PUBLISHING',
    updated_at = now()
WHERE id = $1 AND status = 'SCHEDULED'
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, created_at, updated_at;

-- name: MarkSchedulePublished :one
UPDATE facebook.scheduled_posts
SET status = 'PUBLISHED',
    facebook_post_id = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, created_at, updated_at;

-- name: MarkScheduleFailed :one
UPDATE facebook.scheduled_posts
SET status = 'FAILED',
    error_message = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, created_at, updated_at;

-- name: CancelSchedule :one
UPDATE facebook.scheduled_posts
SET status = 'CANCELLED',
    updated_at = now()
WHERE id = $1 AND status = 'SCHEDULED'
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, created_at, updated_at;

-- name: ListDueScheduled :many
-- Worker query: returns up to N SCHEDULED rows whose scheduled_at is past.
-- Returns 0..N rows; the worker then attempts to claim each via
-- MarkSchedulePublishing (which acts as the lock).
SELECT
  id, page_id, content, image_url, media_urls, status, scheduled_at,
  post_type, trend_reference, ai_generated, engagement_prediction,
  campaign_id, facebook_post_id, error_message, created_at, updated_at
FROM facebook.scheduled_posts
WHERE status = 'SCHEDULED' AND scheduled_at <= now()
ORDER BY scheduled_at ASC
LIMIT $1;
