-- name: InsertPostHistory :one
-- Records a successfully published post. UNIQUE on post_id (FB-side)
-- means a duplicate webhook or worker retry cannot create two history
-- rows for the same FB post.
INSERT INTO facebook.post_history (
  post_id, page_id, content, image_url, media_urls, post_url,
  published_at, likes, comments, shares, reach, engagement_rate
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11, $12
)
ON CONFLICT (post_id) DO UPDATE SET
  likes = EXCLUDED.likes,
  comments = EXCLUDED.comments,
  shares = EXCLUDED.shares,
  reach = EXCLUDED.reach,
  engagement_rate = EXCLUDED.engagement_rate
RETURNING id, post_id, page_id, content, image_url, media_urls, post_url,
          published_at, likes, comments, shares, reach, engagement_rate, created_at;

-- name: ListPostHistory :many
SELECT
  id, post_id, page_id, content, image_url, media_urls, post_url,
  published_at, likes, comments, shares, reach, engagement_rate, created_at
FROM facebook.post_history
ORDER BY published_at DESC
LIMIT $1;
