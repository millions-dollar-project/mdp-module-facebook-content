package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

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
	// UpdateScheduledAt moves a SCHEDULED row to a new time. postType is
	// asserted in the WHERE clause so the personal-vs-fanpage handlers
	// can't accidentally reschedule each other.
	UpdateScheduledAt(ctx context.Context, id string, scheduledAt time.Time, postType models.PostType) (models.ScheduledPost, error)
	// ListForKanban returns scheduled rows joined with brain_drafts +
	// brain_feeds so the Kanban UI can render in one round-trip.
	// statusFilter and kitAccountID are optional (empty/zero = no
	// filter).
	ListForKanban(ctx context.Context, statusFilter string, kitAccountID string, limit, offset int32) ([]KanbanRow, error)
}

// KanbanRow is a scheduled_post enriched with its source brain draft
// and source brain feed. PageID is preserved as a string (empty for
// personal rows) so handlers can render fanpage vs personal cards
// without an extra lookup.
type KanbanRow struct {
	models.ScheduledPost
	BrainDraftID  string
	PersonaID     string
	FeedContent   string
	Thumbnail     string
	FeedMediaURLs json.RawMessage
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
		out = append(out, scheduledFromListRow(row))
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
	return scheduledFromGetRow(row), nil
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
	// Personal rows have no FB Page (PageID stays nil). For all other
	// rows we still pass the page_id; pgtype.UUID accepts the zero
	// value for nil inputs.
	var pageID pgtype.UUID
	if in.PageID != "" {
		pid, err := stringToUUIDErr(in.PageID)
		if err != nil {
			return models.ScheduledPost{}, fmt.Errorf("invalid page id: %w", err)
		}
		pageID = pid
	}
	var kitID pgtype.UUID
	if in.KitAccountID != nil && *in.KitAccountID != "" {
		kid, err := stringToUUIDErr(*in.KitAccountID)
		if err != nil {
			return models.ScheduledPost{}, fmt.Errorf("invalid kit account id: %w", err)
		}
		kitID = kid
	}
	row, err := r.q.CreateScheduled(ctx, db.CreateScheduledParams{
		PageID:               pageID,
		KitAccountID:         kitID,
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
	return scheduledFromCreateRow(row), nil
}

func (r *schedulerRepo) Cancel(ctx context.Context, id string) (models.ScheduledPost, error) {
	row, err := r.q.CancelSchedule(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ScheduledPost{}, ErrNotFound
		}
		return models.ScheduledPost{}, err
	}
	return scheduledFromCancelRow(row), nil
}

func (r *schedulerRepo) MarkPublishing(ctx context.Context, id string) (models.ScheduledPost, error) {
	row, err := r.q.MarkSchedulePublishing(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ScheduledPost{}, ErrNotFound
		}
		return models.ScheduledPost{}, err
	}
	return scheduledFromMarkPublishingRow(row), nil
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
	return scheduledFromMarkPublishedRow(row), nil
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
	return scheduledFromMarkFailedRow(row), nil
}

func (r *schedulerRepo) ListDue(ctx context.Context, limit int32) ([]models.ScheduledPost, error) {
	rows, err := r.q.ListDueScheduled(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]models.ScheduledPost, 0, len(rows))
	for _, row := range rows {
		out = append(out, scheduledFromDueRow(row))
	}
	return out, nil
}

// UpdateScheduledAt changes the scheduled_at of a SCHEDULED row. The
// postType guard in the WHERE clause ensures the personal vs fanpage
// handlers can't accidentally reschedule each other (defense in depth
// on top of the type-discriminated URL paths).
func (r *schedulerRepo) UpdateScheduledAt(ctx context.Context, id string, scheduledAt time.Time, postType models.PostType) (models.ScheduledPost, error) {
	row, err := r.q.UpdateScheduleScheduledAt(ctx, db.UpdateScheduleScheduledAtParams{
		ID:          stringToUUID(id),
		ScheduledAt: timeToPgTime(scheduledAt),
		PostType:    string(postType),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ScheduledPost{}, ErrNotFound
		}
		return models.ScheduledPost{}, err
	}
	return scheduledFromUpdateRow(row), nil
}

// ListForKanban returns scheduled posts enriched with the source brain
// draft and brain feed. statusFilter="" means "any status" (the WHERE
// OR's it out). kitAccountID="" means "any account". The handler calls
// this with the filters it already validated.
func (r *schedulerRepo) ListForKanban(ctx context.Context, statusFilter string, kitAccountID string, limit, offset int32) ([]KanbanRow, error) {
	var kitUUID pgtype.UUID
	if kitAccountID != "" {
		u, err := stringToUUIDErr(kitAccountID)
		if err != nil {
			return nil, fmt.Errorf("invalid kit_account_id: %w", err)
		}
		kitUUID = u
	}
	rows, err := r.q.ListScheduledForKanban(ctx, db.ListScheduledForKanbanParams{
		StatusFilter: statusFilter,
		KitAccountID: kitUUID,
		Off:          offset,
		PageSize:     limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]KanbanRow, 0, len(rows))
	for _, row := range rows {
		var feedMedia json.RawMessage
		if len(row.FeedMediaUrls) > 0 {
			feedMedia = json.RawMessage(row.FeedMediaUrls)
		} else {
			feedMedia = json.RawMessage("[]")
		}
		var personaID string
		if row.PersonaID != nil {
			personaID = *row.PersonaID
		}
		var draftID string
		if row.BrainDraftID.Valid {
			draftID = uuidToString(row.BrainDraftID)
		}
		var thumbnail string
		if row.Thumbnail != nil {
			thumbnail = *row.Thumbnail
		}
		var feedContent string
		if row.FeedContent != nil {
			feedContent = *row.FeedContent
		}
		out = append(out, KanbanRow{
			ScheduledPost: scheduledFromKanbanRow(row),
			BrainDraftID:  draftID,
			PersonaID:     personaID,
			FeedContent:   feedContent,
			Thumbnail:     thumbnail,
			FeedMediaURLs: feedMedia,
		})
	}
	return out, nil
}

// scheduledFromRow builds a ScheduledPost model from any sqlc row type
// that mirrors the facebook.scheduled_posts columns (including
// kit_account_id). All per-op *Row structs are structurally identical
// since sqlc emits a fresh type per RETURNING/SELECT — we convert
// them via a small adapter struct so the conversion lives in exactly
// one place.
func scheduledFromRow(r scheduledRowAdapter) models.ScheduledPost {
	media := json.RawMessage(r.MediaUrls)
	if len(media) == 0 {
		media = json.RawMessage("[]")
	}
	var engagement json.RawMessage
	if len(r.EngagementPrediction) > 0 {
		engagement = r.EngagementPrediction
	}
	var kitID *string
	if r.KitAccountID.Valid {
		s := uuidToString(r.KitAccountID)
		kitID = &s
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
		KitAccountID:         kitID,
		CreatedAt:            pgTimeToTime(r.CreatedAt),
		UpdatedAt:            pgTimeToTime(r.UpdatedAt),
	}
}

// scheduledRowAdapter collapses the per-op *Row structs sqlc emits
// (which have identical column shapes) into a single struct so we only
// need one converter.
type scheduledRowAdapter struct {
	ID                   pgtype.UUID
	PageID               pgtype.UUID
	Content              string
	ImageUrl             *string
	MediaUrls            []byte
	Status               string
	ScheduledAt          pgtype.Timestamptz
	PostType             string
	TrendReference       *string
	AiGenerated          bool
	EngagementPrediction []byte
	CampaignID           *string
	FacebookPostID       *string
	ErrorMessage         *string
	KitAccountID         pgtype.UUID
	CreatedAt            pgtype.Timestamptz
	UpdatedAt            pgtype.Timestamptz
}

func scheduledFromListRow(r db.ListScheduledRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}

func scheduledFromGetRow(r db.GetScheduledRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}

func scheduledFromCreateRow(r db.CreateScheduledRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}

func scheduledFromCancelRow(r db.CancelScheduleRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}

func scheduledFromMarkPublishingRow(r db.MarkSchedulePublishingRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}

func scheduledFromMarkPublishedRow(r db.MarkSchedulePublishedRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}

func scheduledFromMarkFailedRow(r db.MarkScheduleFailedRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}

func scheduledFromDueRow(r db.ListDueScheduledRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}

func scheduledFromUpdateRow(r db.UpdateScheduleScheduledAtRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}

func scheduledFromKanbanRow(r db.ListScheduledForKanbanRow) models.ScheduledPost {
	return scheduledFromRow(scheduledRowAdapter{
		ID: r.ID, PageID: r.PageID, Content: r.Content,
		ImageUrl: r.ImageUrl, MediaUrls: r.MediaUrls, Status: r.Status,
		ScheduledAt: r.ScheduledAt, PostType: r.PostType,
		TrendReference: r.TrendReference, AiGenerated: r.AiGenerated,
		EngagementPrediction: r.EngagementPrediction, CampaignID: r.CampaignID,
		FacebookPostID: r.FacebookPostID, ErrorMessage: r.ErrorMessage,
		KitAccountID: r.KitAccountID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	})
}
