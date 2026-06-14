-- name: ListComments :many
SELECT
  id, post_id, page_id, from_id, from_name, message, created_time, like_count,
  reply_count, sentiment, intent, priority, is_hidden, is_liked,
  is_private_reply_sent, collected_info, received_at, claimed_at, claimed_by, processed
FROM facebook.comments
WHERE page_id = $1
ORDER BY received_at DESC
LIMIT $2;

-- name: ListUnprocessedComments :many
SELECT
  id, post_id, page_id, from_id, from_name, message, created_time, like_count,
  reply_count, sentiment, intent, priority, is_hidden, is_liked,
  is_private_reply_sent, collected_info, received_at, claimed_at, claimed_by, processed
FROM facebook.comments
WHERE page_id = $1 AND processed = false
ORDER BY received_at ASC
LIMIT $2;

-- name: GetComment :one
SELECT
  id, post_id, page_id, from_id, from_name, message, created_time, like_count,
  reply_count, sentiment, intent, priority, is_hidden, is_liked,
  is_private_reply_sent, collected_info, received_at, claimed_at, claimed_by, processed
FROM facebook.comments
WHERE id = $1;

-- name: InsertComment :exec
INSERT INTO facebook.comments (
  id, post_id, page_id, from_id, from_name, message, created_time, like_count,
  reply_count, sentiment, intent, priority, is_hidden, is_liked,
  is_private_reply_sent, collected_info, received_at, claimed_at, claimed_by, processed
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
)
ON CONFLICT (id) DO UPDATE SET
  message = EXCLUDED.message,
  like_count = EXCLUDED.like_count,
  reply_count = EXCLUDED.reply_count,
  sentiment = EXCLUDED.sentiment,
  intent = EXCLUDED.intent,
  priority = EXCLUDED.priority,
  is_hidden = EXCLUDED.is_hidden,
  is_liked = EXCLUDED.is_liked,
  is_private_reply_sent = EXCLUDED.is_private_reply_sent,
  collected_info = EXCLUDED.collected_info,
  received_at = EXCLUDED.received_at,
  processed = EXCLUDED.processed;

-- name: ClaimComment :one
SELECT facebook.claim_comment($1, $2) AS claimed;

-- name: UpdateCommentLiked :exec
UPDATE facebook.comments
SET is_liked = $2,
    processed = true
WHERE id = $1;

-- name: UpdateCommentPrivateReply :exec
UPDATE facebook.comments
SET is_private_reply_sent = $2,
    processed = true
WHERE id = $1;

-- name: MarkCommentProcessed :exec
UPDATE facebook.comments
SET processed = true
WHERE id = $1;

-- name: InsertCommentReply :exec
INSERT INTO facebook.comment_replies (
  comment_id, reply_type, content, sent_by, status, facebook_reply_id, sent_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7
);

-- name: ListCommentReplies :many
SELECT
  id, comment_id, reply_type, content, sent_by, status, facebook_reply_id, sent_at
FROM facebook.comment_replies
WHERE comment_id = $1
ORDER BY sent_at DESC;
