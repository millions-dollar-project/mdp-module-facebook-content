-- name: CreateCampaign :one
INSERT INTO facebook.repost_campaigns (name, source_post_url, source_post_text, source_post_media_urls, caption_style, scheduled_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListCampaigns :many
SELECT * FROM facebook.repost_campaigns ORDER BY created_at DESC;

-- name: GetCampaign :one
SELECT * FROM facebook.repost_campaigns WHERE id = $1;

-- name: GetDueCampaigns :many
SELECT * FROM facebook.repost_campaigns
WHERE status = 'pending' AND scheduled_at <= $1 AND scheduled_at >= $2
ORDER BY scheduled_at ASC;

-- name: UpdateCampaignStatus :exec
UPDATE facebook.repost_campaigns
SET status = $2, started_at = $3, completed_at = $4, last_error = $5
WHERE id = $1;

-- name: RescheduleCampaign :exec
UPDATE facebook.repost_campaigns
SET scheduled_at = $2, status = CASE WHEN status IN ('failed','expired') THEN 'pending' ELSE status END,
    started_at = NULL, completed_at = NULL, last_error = NULL
WHERE id = $1;

-- name: ExpireOverdueCampaigns :exec
UPDATE facebook.repost_campaigns
SET status = 'expired', last_error = 'Schedule expired: past due date'
WHERE status = 'pending' AND scheduled_at < $1;

-- name: DeleteCampaign :exec
DELETE FROM facebook.repost_campaigns WHERE id = $1;

-- name: CreateJob :one
INSERT INTO facebook.repost_jobs (campaign_id, account_id, group_id, scheduled_at, anonymous_posting, auto_enabled)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListJobsForCampaign :many
SELECT * FROM facebook.repost_jobs WHERE campaign_id = $1 ORDER BY created_at ASC;

-- name: ListPendingJobsForCampaign :many
SELECT * FROM facebook.repost_jobs WHERE campaign_id = $1 AND status = 'pending' ORDER BY created_at ASC;

-- name: ListAllJobs :many
-- Queue view: paginate over every job across campaigns. Optional filters
-- are applied via COALESCE-style NULL-tolerant WHERE clauses so a single
-- query can serve the "Tất cả / Đang chờ / Theo account / Theo group"
-- tabs in the plugin UI.
SELECT * FROM facebook.repost_jobs
WHERE ($1::text = '' OR status = $1)
  AND ($2::uuid IS NULL OR account_id = $2)
  AND ($3::text = '' OR group_id = $3)
ORDER BY updated_at DESC
LIMIT $4;

-- name: UpdateJob :exec
-- Single-row update for the per-job edit modal: schedule time + flags.
-- Bumps updated_at so the queue view's freshness index picks up the change.
UPDATE facebook.repost_jobs
SET scheduled_at       = $2,
    auto_enabled       = $3,
    anonymous_posting  = $4,
    status             = CASE WHEN status IN ('failed','expired') THEN 'pending' ELSE status END,
    last_error         = CASE WHEN status IN ('failed','expired') THEN NULL ELSE last_error END,
    started_at         = CASE WHEN status IN ('failed','expired') THEN NULL ELSE started_at END,
    updated_at         = now()
WHERE id = $1;

-- name: UpdateJobStatus :exec
UPDATE facebook.repost_jobs
SET status = $2, attempts = $3, last_error = $4, post_url = $5, started_at = $6, completed_at = $7
WHERE id = $1;

-- name: RescheduleJobsForCampaign :exec
UPDATE facebook.repost_jobs
SET scheduled_at = $2, status = CASE WHEN status IN ('failed','running','expired') THEN 'pending' ELSE status END,
    last_error = CASE WHEN status IN ('failed','running','expired') THEN NULL ELSE last_error END,
    started_at = CASE WHEN status IN ('failed','running','expired') THEN NULL ELSE started_at END
WHERE campaign_id = $1 AND status != 'completed';

-- name: EnableAutoForAccountJobs :exec
UPDATE facebook.repost_jobs
SET auto_enabled = true, anonymous_posting = $2,
    status = CASE WHEN status IN ('failed','expired') THEN 'pending' ELSE status END,
    last_error = CASE WHEN status IN ('failed','expired') THEN NULL ELSE last_error END,
    started_at = CASE WHEN status IN ('failed','expired') THEN NULL ELSE started_at END
WHERE account_id = $1 AND status != 'completed';

-- name: DisableAutoForAccountJobs :exec
UPDATE facebook.repost_jobs
SET auto_enabled = false
WHERE account_id = $1 AND status != 'completed';

-- name: ExpireOverdueJobs :exec
UPDATE facebook.repost_jobs
SET status = 'expired', last_error = 'Schedule expired: past due date'
WHERE status = 'pending' AND scheduled_at IS NOT NULL AND scheduled_at < $1;

-- name: CreateCrawledPost :one
INSERT INTO facebook.crawled_posts (page_id, source_url, fb_post_id, content, media_urls, video_urls, thumbnail_urls, full_picture, media_type, likes, comments, shares, reaction_icons, posted_at, permalink)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING *;

-- name: ListCrawledPostsForPage :many
SELECT * FROM facebook.crawled_posts WHERE page_id = $1 ORDER BY created_at DESC;

-- name: ListSelectedCrawledPosts :many
SELECT * FROM facebook.crawled_posts WHERE page_id = $1 AND is_selected = true ORDER BY created_at DESC;

-- name: SetCrawledPostSelected :exec
UPDATE facebook.crawled_posts SET is_selected = $2 WHERE id = $1;

-- name: DeleteCrawledPostsForPage :exec
DELETE FROM facebook.crawled_posts WHERE page_id = $1;

-- name: CreateAccount :one
INSERT INTO facebook.fb_accounts (name, email, profile_path, cookies_json)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListAccounts :many
SELECT * FROM facebook.fb_accounts ORDER BY created_at DESC;

-- name: GetAccount :one
SELECT * FROM facebook.fb_accounts WHERE id = $1;

-- name: UpdateAccountStatus :exec
UPDATE facebook.fb_accounts SET status = $2, last_used_at = $3 WHERE id = $1;

-- name: DeleteAccount :exec
DELETE FROM facebook.fb_accounts WHERE id = $1;

-- name: CreateGroup :one
INSERT INTO facebook.fb_groups (group_id, name, assigned_account_id, status)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListGroups :many
SELECT * FROM facebook.fb_groups ORDER BY created_at DESC;

-- name: ListActiveGroups :many
SELECT * FROM facebook.fb_groups WHERE status = 'active' ORDER BY created_at DESC;

-- name: GetGroup :one
SELECT * FROM facebook.fb_groups WHERE id = $1;

-- name: UpdateGroup :exec
UPDATE facebook.fb_groups SET name = $2, assigned_account_id = $3, status = $4, last_posted_at = $5 WHERE id = $1;

-- name: DeleteGroup :exec
DELETE FROM facebook.fb_groups WHERE id = $1;
