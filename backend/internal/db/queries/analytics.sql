-- name: AnalyticsSummary :one
-- Aggregates metrics over a date range (inclusive start, exclusive end).
SELECT
  COALESCE(COUNT(*), 0) AS total_posts,
  COALESCE(SUM(likes), 0) AS total_likes,
  COALESCE(SUM(comments), 0) AS total_comments,
  COALESCE(SUM(shares), 0) AS total_shares,
  COALESCE(SUM(reach), 0) AS total_reach
FROM facebook.post_history
WHERE published_at >= $1 AND published_at < $2;

-- name: AnalyticsSeries :many
-- Daily breakdown for chart rendering.
SELECT
  DATE(published_at) AS date,
  COUNT(*) AS posts,
  COALESCE(SUM(likes), 0) AS likes,
  COALESCE(SUM(comments), 0) AS comments,
  COALESCE(SUM(shares), 0) AS shares
FROM facebook.post_history
WHERE published_at >= $1 AND published_at < $2
GROUP BY DATE(published_at)
ORDER BY DATE(published_at);

-- name: DailyStats :many
-- Recent N days of daily stats (used by the dashboard summary).
WITH days AS (
  SELECT generate_series(
    CURRENT_DATE - ($1 - 1) * INTERVAL '1 day',
    CURRENT_DATE,
    INTERVAL '1 day'
  )::date AS date
)
SELECT
  d.date,
  COALESCE(COUNT(ph.id), 0)::int AS posts_published,
  COALESCE(SUM(ph.likes), 0)::int AS total_likes,
  COALESCE(SUM(ph.comments), 0)::int AS total_comments,
  COALESCE(SUM(ph.shares), 0)::int AS total_shares
FROM days d
LEFT JOIN facebook.post_history ph ON DATE(ph.published_at) = d.date
GROUP BY d.date
ORDER BY d.date;
