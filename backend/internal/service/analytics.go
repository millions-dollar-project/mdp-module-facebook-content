package service

import (
	"context"
	"errors"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Analytics aggregates post-history metrics for dashboards.
type Analytics struct {
	repo repo.AnalyticsRepo
}

// NewAnalytics builds an Analytics service.
func NewAnalytics(r repo.AnalyticsRepo) *Analytics { return &Analytics{repo: r} }

// Get returns engagement analytics for a date range. rangeStr must be one of
// "7d", "30d", or "90d".
func (s *Analytics) Get(ctx context.Context, rangeStr string) (models.EngagementAnalytics, error) {
	end := time.Now().UTC()
	var start time.Time
	switch rangeStr {
	case "7d":
		start = end.AddDate(0, 0, -7)
	case "30d":
		start = end.AddDate(0, 0, -30)
	case "90d":
		start = end.AddDate(0, 0, -90)
	default:
		return models.EngagementAnalytics{}, errors.New("range must be 7d, 30d, or 90d")
	}

	summary, err := s.repo.Summary(ctx, start, end)
	if err != nil {
		return models.EngagementAnalytics{}, err
	}
	series, err := s.repo.Series(ctx, start, end)
	if err != nil {
		return models.EngagementAnalytics{}, err
	}

	totalEngagement := summary.TotalLikes + summary.TotalComments + summary.TotalShares
	var rate float64
	if summary.TotalReach > 0 {
		rate = float64(totalEngagement) / float64(summary.TotalReach)
	}

	return models.EngagementAnalytics{
		Range:           rangeStr,
		TotalPosts:      summary.TotalPosts,
		TotalLikes:      summary.TotalLikes,
		TotalComments:   summary.TotalComments,
		TotalShares:     summary.TotalShares,
		TotalReach:      summary.TotalReach,
		TotalEngagement: totalEngagement,
		EngagementRate:  rate,
		Series:          series,
	}, nil
}

// DailyStats returns the last N days of daily aggregates.
func (s *Analytics) DailyStats(ctx context.Context, days int32) ([]models.DailyStats, error) {
	if days <= 0 || days > 90 {
		days = 14
	}
	return s.repo.DailyStats(ctx, days)
}
