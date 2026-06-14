package models

// AnalyticsSummary is the high-level aggregate for a date range.
type AnalyticsSummary struct {
	TotalPosts    int64 `json:"totalPosts"`
	TotalLikes    int64 `json:"totalLikes"`
	TotalComments int64 `json:"totalComments"`
	TotalShares   int64 `json:"totalShares"`
	TotalReach    int64 `json:"totalReach"`
}

// AnalyticsSeriesPoint is one day in the chart series.
type AnalyticsSeriesPoint struct {
	Date     string `json:"date"`
	Likes    int64  `json:"likes"`
	Comments int64  `json:"comments"`
	Shares   int64  `json:"shares"`
}

// DailyStats is a single row for the dashboard summary card.
type DailyStats struct {
	Date           string `json:"date"`
	PostsPublished int32  `json:"postsPublished"`
	TotalLikes     int32  `json:"totalLikes"`
	TotalComments  int32  `json:"totalComments"`
	TotalShares    int32  `json:"totalShares"`
}

// EngagementAnalytics matches the plugin type.
type EngagementAnalytics struct {
	Range          string                   `json:"range"`
	TotalPosts     int64                    `json:"totalPosts"`
	TotalLikes     int64                    `json:"totalLikes"`
	TotalComments  int64                    `json:"totalComments"`
	TotalShares    int64                    `json:"totalShares"`
	TotalReach     int64                    `json:"totalReach"`
	TotalEngagement int64                   `json:"totalEngagement"`
	EngagementRate float64                  `json:"engagementRate"`
	Series         []AnalyticsSeriesPoint   `json:"series"`
}
