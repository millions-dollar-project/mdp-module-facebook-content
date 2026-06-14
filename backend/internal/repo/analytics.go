package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// AnalyticsRepo aggregates post-history metrics for dashboards.
type AnalyticsRepo interface {
	Summary(ctx context.Context, start, end time.Time) (models.AnalyticsSummary, error)
	Series(ctx context.Context, start, end time.Time) ([]models.AnalyticsSeriesPoint, error)
	DailyStats(ctx context.Context, days int32) ([]models.DailyStats, error)
}

type analyticsRepo struct{ q *db.Queries }

// NewAnalyticsRepo wires an AnalyticsRepo backed by sqlc.
func NewAnalyticsRepo(q *db.Queries) AnalyticsRepo { return &analyticsRepo{q: q} }

func (r *analyticsRepo) Summary(ctx context.Context, start, end time.Time) (models.AnalyticsSummary, error) {
	row, err := r.q.AnalyticsSummary(ctx, db.AnalyticsSummaryParams{
		PublishedAt:   pgtype.Timestamptz{Time: start, Valid: true},
		PublishedAt_2: pgtype.Timestamptz{Time: end, Valid: true},
	})
	if err != nil {
		return models.AnalyticsSummary{}, err
	}
	return models.AnalyticsSummary{
		TotalPosts:    toInt64(row.TotalPosts),
		TotalLikes:    toInt64(row.TotalLikes),
		TotalComments: toInt64(row.TotalComments),
		TotalShares:   toInt64(row.TotalShares),
		TotalReach:    toInt64(row.TotalReach),
	}, nil
}

func (r *analyticsRepo) Series(ctx context.Context, start, end time.Time) ([]models.AnalyticsSeriesPoint, error) {
	rows, err := r.q.AnalyticsSeries(ctx, db.AnalyticsSeriesParams{
		PublishedAt:   pgtype.Timestamptz{Time: start, Valid: true},
		PublishedAt_2: pgtype.Timestamptz{Time: end, Valid: true},
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.AnalyticsSeriesPoint, len(rows))
	for i, r := range rows {
		out[i] = models.AnalyticsSeriesPoint{
			Date:     r.Date.Time.Format("2006-01-02"),
			Likes:    toInt64(r.Likes),
			Comments: toInt64(r.Comments),
			Shares:   toInt64(r.Shares),
		}
	}
	return out, nil
}

func (r *analyticsRepo) DailyStats(ctx context.Context, days int32) ([]models.DailyStats, error) {
	rows, err := r.q.DailyStats(ctx, days)
	if err != nil {
		return nil, err
	}
	out := make([]models.DailyStats, len(rows))
	for i, r := range rows {
		out[i] = models.DailyStats{
			Date:           r.Date.Time.Format("2006-01-02"),
			PostsPublished: r.PostsPublished,
			TotalLikes:     r.TotalLikes,
			TotalComments:  r.TotalComments,
			TotalShares:    r.TotalShares,
		}
	}
	return out, nil
}

func toInt64(v interface{}) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int32:
		return int64(n)
	case int:
		return int64(n)
	case float64:
		return int64(n)
	case nil:
		return 0
	default:
		return 0
	}
}
