-- name: ListScheduled :many
SELECT
  id, page_id, content, image_url, media_urls, status, scheduled_at,
  post_type, trend_reference, ai_generated, engagement_prediction,
  campaign_id, facebook_post_id, error_message, kit_account_id,
  created_at, updated_at
FROM facebook.scheduled_posts
ORDER BY scheduled_at ASC;

-- name: GetScheduled :one
SELECT
  id, page_id, content, image_url, media_urls, status, scheduled_at,
  post_type, trend_reference, ai_generated, engagement_prediction,
  campaign_id, facebook_post_id, error_message, kit_account_id,
  created_at, updated_at
FROM facebook.scheduled_posts
WHERE id = $1;

-- name: CreateScheduled :one
INSERT INTO facebook.scheduled_posts (
  page_id, content, image_url, media_urls, status, scheduled_at,
  post_type, trend_reference, ai_generated, engagement_prediction,
  campaign_id, kit_account_id
) VALUES (
  $1, $2, $3, $4, 'SCHEDULED', $5,
  $6, $7, $8, $9, $10, $11
)
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, kit_account_id,
          created_at, updated_at;

-- name: MarkSchedulePublishing :one
-- Atomic claim: only succeeds if status is still SCHEDULED.
-- Used by the worker to prevent two workers picking the same row.
UPDATE facebook.scheduled_posts
SET status = 'PUBLISHING',
    updated_at = now()
WHERE id = $1 AND status = 'SCHEDULED'
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, kit_account_id,
          created_at, updated_at;

-- name: MarkSchedulePublished :one
UPDATE facebook.scheduled_posts
SET status = 'PUBLISHED',
    facebook_post_id = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, kit_account_id,
          created_at, updated_at;

-- name: MarkScheduleFailed :one
UPDATE facebook.scheduled_posts
SET status = 'FAILED',
    error_message = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, kit_account_id,
          created_at, updated_at;

-- name: CancelSchedule :one
UPDATE facebook.scheduled_posts
SET status = 'CANCELLED',
    updated_at = now()
WHERE id = $1 AND status = 'SCHEDULED'
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, kit_account_id,
          created_at, updated_at;

-- name: ListDueScheduled :many
-- Worker query: returns up to N SCHEDULED rows whose scheduled_at is past.
-- Returns 0..N rows; the worker then attempts to claim each via
-- MarkSchedulePublishing (which acts as the lock).
SELECT
  id, page_id, content, image_url, media_urls, status, scheduled_at,
  post_type, trend_reference, ai_generated, engagement_prediction,
  campaign_id, facebook_post_id, error_message, kit_account_id,
  created_at, updated_at
FROM facebook.scheduled_posts
WHERE status = 'SCHEDULED' AND scheduled_at <= now()
ORDER BY scheduled_at ASC
LIMIT $1;

-- name: UpdateScheduleScheduledAt :one
-- Reschedule a SCHEDULED row. $3 asserts post_type so a UI bug can't
-- silently reschedule a personal row via the fanpage handler (or
-- vice versa).
UPDATE facebook.scheduled_posts
SET scheduled_at = $2,
    updated_at = now()
WHERE id = $1
  AND status = 'SCHEDULED'
  AND post_type = $3
RETURNING id, page_id, content, image_url, media_urls, status, scheduled_at,
          post_type, trend_reference, ai_generated, engagement_prediction,
          campaign_id, facebook_post_id, error_message, kit_account_id,
          created_at, updated_at;

-- name: ListScheduledForKanban :many
-- Enriched list for the Kanban tab. Joins brain_drafts (via
-- kanban_job_id) and brain_feeds (via feed_id) so the UI can render
-- a thumbnail + persona label without N+1 calls.
--
-- Filters:
--   $1 = status (empty string = no filter).
--   $2 = kit_account_id uuid (NULL = no filter).
--   $3 = limit, $4 = offset.
-- The handler splits a comma-separated status list into N round-trips
-- (cheaper than a complex IN-list SQL with this row count).
SELECT
  sp.id, sp.page_id, sp.content, sp.image_url, sp.media_urls, sp.status,
  sp.scheduled_at, sp.post_type, sp.trend_reference, sp.ai_generated,
  sp.engagement_prediction, sp.campaign_id, sp.facebook_post_id,
  sp.error_message, sp.kit_account_id, sp.created_at, sp.updated_at,
  bd.id              AS brain_draft_id,
  bd.persona_id      AS persona_id,
  bf.content         AS feed_content,
  bf.full_picture    AS thumbnail,
  bf.media_urls      AS feed_media_urls
FROM facebook.scheduled_posts sp
LEFT JOIN facebook.brain_drafts bd ON bd.kanban_job_id = sp.id::text
LEFT JOIN facebook.brain_feeds  bf ON bf.id            = bd.feed_id
WHERE (sqlc.arg(status_filter)::text = ''
       OR sp.status = sqlc.arg(status_filter))
  AND (sqlc.arg(kit_account_id)::uuid IS NULL
       OR sp.kit_account_id = sqlc.arg(kit_account_id))
ORDER BY sp.scheduled_at ASC
LIMIT sqlc.arg(page_size) OFFSET sqlc.arg(off);