package repo

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

type schedulerRepo struct{ q *db.Queries }

// SchedulerRepo is the contract the service layer depends on.
type SchedulerRepo interface {
	List(ctx context.Context) ([]models.ScheduledPost, error)
	Get(ctx context.Context, id string) (models.ScheduledPost, error)
	Schedule(ctx context.Context, in models.ScheduledPost) (models.ScheduledPost, error)
	Cancel(ctx context.Context, id string) (models.ScheduledPost, error)
	MarkPublishing(ctx context.Context, id string) (models.ScheduledPost, error)
	MarkPublished(ctx context.Context, id, facebookPostID string) (models.ScheduledPost, error)
	MarkFailed(ctx context.Context, id, errMsg string) (models.ScheduledPost, error)
	ListDue(ctx context.Context, limit int32) ([]models.ScheduledPost, error)
}

// NewSchedulerRepo wires a SchedulerRepo backed by sqlc.
func NewSchedulerRepo(q *db.Queries) SchedulerRepo { return &schedulerRepo{q: q} }

func (r *schedulerRepo) List(ctx context.Context) ([]models.ScheduledPost, error) {
	rows, err := r.q.ListScheduled(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]models.ScheduledPost, 0, len(rows))
	for _, row := range rows {
		out = append(out, scheduledFromRow(row))
	}
	return out, nil
}

func (r *schedulerRepo) Get(ctx context.Context, id string) (models.ScheduledPost, error) {
	row, err := r.q.GetScheduled(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ScheduledPost{}, ErrNotFound
		}
		return models.ScheduledPost{}, err
	}
	return scheduledFromRow(row), nil
}

func (r *schedulerRepo) Schedule(ctx context.Context, in models.ScheduledPost) (models.ScheduledPost, error) {
	media := in.MediaURLs
	if len(media) == 0 {
		media = json.RawMessage("[]")
	}
	engagement := in.EngagementPrediction
	if len(engagement) == 0 {
		engagement = nil
	}
	postType := in.PostType
	if postType == "" {
		postType = models.PostTypeText
	}
	row, err := r.q.CreateScheduled(ctx, db.CreateScheduledParams{
		PageID:               stringToUUID(in.PageID),
		Content:              in.Content,
		ImageUrl:             in.ImageURL,
		MediaUrls:            media,
		ScheduledAt:          timeToPgTime(in.ScheduledAt),
		PostType:             string(postType),
		TrendReference:       in.TrendReference,
		AiGenerated:          in.AIGenerated,
		EngagementPrediction: engagement,
		CampaignID:           in.CampaignID,
	})
	if err != nil {
		return models.ScheduledPost{}, err
	}
	return scheduledFromRow(row), nil
}

func (r *schedulerRepo) Cancel(ctx context.Context, id string) (models.ScheduledPost, error) {
	row, err := r.q.CancelSchedule(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ScheduledPost{}, ErrNotFound
		}
		return models.ScheduledPost{}, err
	}
	return scheduledFromRow(row), nil
}

func (r *schedulerRepo) MarkPublishing(ctx context.Context, id string) (models.ScheduledPost, error) {
	row, err := r.q.MarkSchedulePublishing(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ScheduledPost{}, ErrNotFound
		}
		return models.ScheduledPost{}, err
	}
	return scheduledFromRow(row), nil
}

func (r *schedulerRepo) MarkPublished(ctx context.Context, id, facebookPostID string) (models.ScheduledPost, error) {
	row, err := r.q.MarkSchedulePublished(ctx, db.MarkSchedulePublishedParams{
		ID:             stringToUUID(id),
		FacebookPostID: &facebookPostID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ScheduledPost{}, ErrNotFound
		}
		return models.ScheduledPost{}, err
	}
	return scheduledFromRow(row), nil
}

func (r *schedulerRepo) MarkFailed(ctx context.Context, id, errMsg string) (models.ScheduledPost, error) {
	row, err := r.q.MarkScheduleFailed(ctx, db.MarkScheduleFailedParams{
		ID:           stringToUUID(id),
		ErrorMessage: &errMsg,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ScheduledPost{}, ErrNotFound
		}
		return models.ScheduledPost{}, err
	}
	return scheduledFromRow(row), nil
}

func (r *schedulerRepo) ListDue(ctx context.Context, limit int32) ([]models.ScheduledPost, error) {
	rows, err := r.q.ListDueScheduled(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]models.ScheduledPost, 0, len(rows))
	for _, row := range rows {
		out = append(out, scheduledFromRow(row))
	}
	return out, nil
}

func scheduledFromRow(r db.FacebookScheduledPost) models.ScheduledPost {
	media := json.RawMessage(r.MediaUrls)
	if len(media) == 0 {
		media = json.RawMessage("[]")
	}
	var engagement json.RawMessage
	if len(r.EngagementPrediction) > 0 {
		engagement = r.EngagementPrediction
	}
	return models.ScheduledPost{
		ID:                   uuidToString(r.ID),
		PageID:               uuidToString(r.PageID),
		Content:              r.Content,
		ImageURL:             r.ImageUrl,
		MediaURLs:            media,
		Status:               models.ScheduleStatus(r.Status),
		ScheduledAt:          pgTimeToTime(r.ScheduledAt),
		PostType:             models.PostType(r.PostType),
		TrendReference:       r.TrendReference,
		AIGenerated:          r.AiGenerated,
		EngagementPrediction: engagement,
		CampaignID:           r.CampaignID,
		FacebookPostID:       r.FacebookPostID,
		ErrorMessage:         r.ErrorMessage,
		CreatedAt:            pgTimeToTime(r.CreatedAt),
		UpdatedAt:            pgTimeToTime(r.UpdatedAt),
	}
}
