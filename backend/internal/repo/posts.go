package repo

import (
	"context"
	"encoding/json"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

type postsRepo struct{ q *db.Queries }

// PostsRepo records successfully published posts and surfaces them
// for the History tab and (Phase 4) analytics aggregation.
type PostsRepo interface {
	InsertHistory(ctx context.Context, entry models.PostHistoryEntry) (models.PostHistoryEntry, error)
	ListHistory(ctx context.Context, limit int32) ([]models.PostHistoryEntry, error)
}

// NewPostsRepo wires a PostsRepo backed by sqlc.
func NewPostsRepo(q *db.Queries) PostsRepo { return &postsRepo{q: q} }

func (r *postsRepo) InsertHistory(ctx context.Context, in models.PostHistoryEntry) (models.PostHistoryEntry, error) {
	publishedAt := in.PublishedAt
	if publishedAt.IsZero() {
		publishedAt = time.Now().UTC()
	}
	media := in.MediaURLs
	if len(media) == 0 {
		media = json.RawMessage("[]")
	}
	row, err := r.q.InsertPostHistory(ctx, db.InsertPostHistoryParams{
		PostID:         in.PostID,
		PageID:         stringToUUID(in.PageID),
		Content:        in.Content,
		ImageUrl:       in.ImageURL,
		MediaUrls:      media,
		PostUrl:        in.PostURL,
		PublishedAt:    timeToPgTime(publishedAt),
		Likes:          int32OrZero(in.Likes),
		Comments:       int32OrZero(in.Comments),
		Shares:         int32OrZero(in.Shares),
		Reach:          intToInt32Ptr(in.Reach),
		EngagementRate: float64ToNumeric(in.EngagementRate),
	})
	if err != nil {
		return models.PostHistoryEntry{}, err
	}
	return historyFromRow(row), nil
}

func (r *postsRepo) ListHistory(ctx context.Context, limit int32) ([]models.PostHistoryEntry, error) {
	rows, err := r.q.ListPostHistory(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]models.PostHistoryEntry, 0, len(rows))
	for _, row := range rows {
		out = append(out, historyFromRow(row))
	}
	return out, nil
}

func historyFromRow(r db.FacebookPostHistory) models.PostHistoryEntry {
	media := json.RawMessage(r.MediaUrls)
	if len(media) == 0 {
		media = json.RawMessage("[]")
	}
	var reach *int
	if r.Reach != nil {
		v := int(*r.Reach)
		reach = &v
	}
	return models.PostHistoryEntry{
		ID:             uuidToString(r.ID),
		PostID:         r.PostID,
		PageID:         uuidToString(r.PageID),
		Content:        r.Content,
		ImageURL:       r.ImageUrl,
		MediaURLs:      media,
		PostURL:        r.PostUrl,
		PublishedAt:    pgTimeToTime(r.PublishedAt),
		Likes:          int(r.Likes),
		Comments:       int(r.Comments),
		Shares:         int(r.Shares),
		Reach:          reach,
		EngagementRate: numericToFloat64(r.EngagementRate),
		CreatedAt:      pgTimeToTime(r.CreatedAt),
	}
}

func int32OrZero(n int) int32 {
	if n <= 0 {
		return 0
	}
	return int32(n)
}

func intToInt32Ptr(p *int) *int32 {
	if p == nil {
		return nil
	}
	v := int32(*p)
	return &v
}
