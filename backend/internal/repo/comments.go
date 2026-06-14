package repo

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// CommentsRepo is the contract for comment data access.
type CommentsRepo interface {
	ListByPage(ctx context.Context, pageID string, limit int32) ([]models.Comment, error)
	ListUnprocessed(ctx context.Context, pageID string, limit int32) ([]models.Comment, error)
	Get(ctx context.Context, id string) (models.Comment, error)
	Upsert(ctx context.Context, in models.Comment) error
	Claim(ctx context.Context, commentID, claimedBy string) (bool, error)
	UpdateLiked(ctx context.Context, commentID string, liked bool) error
	UpdatePrivateReply(ctx context.Context, commentID string, sent bool) error
	MarkProcessed(ctx context.Context, commentID string) error
	InsertReply(ctx context.Context, in models.CommentReply) error
	ListReplies(ctx context.Context, commentID string) ([]models.CommentReply, error)
}

type commentsRepo struct{ q *db.Queries }

// NewCommentsRepo wires a Postgres-backed comments repo.
func NewCommentsRepo(q *db.Queries) CommentsRepo { return &commentsRepo{q: q} }

func (r *commentsRepo) ListByPage(ctx context.Context, pageID string, limit int32) ([]models.Comment, error) {
	rows, err := r.q.ListComments(ctx, db.ListCommentsParams{
		PageID: stringToUUID(pageID),
		Limit:  limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.Comment, 0, len(rows))
	for _, row := range rows {
		out = append(out, commentFromRow(row))
	}
	return out, nil
}

func (r *commentsRepo) ListUnprocessed(ctx context.Context, pageID string, limit int32) ([]models.Comment, error) {
	rows, err := r.q.ListUnprocessedComments(ctx, db.ListUnprocessedCommentsParams{
		PageID: stringToUUID(pageID),
		Limit:  limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.Comment, 0, len(rows))
	for _, row := range rows {
		out = append(out, commentFromRow(row))
	}
	return out, nil
}

func (r *commentsRepo) Get(ctx context.Context, id string) (models.Comment, error) {
	row, err := r.q.GetComment(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Comment{}, ErrNotFound
		}
		return models.Comment{}, err
	}
	return commentFromRow(row), nil
}

func (r *commentsRepo) Upsert(ctx context.Context, in models.Comment) error {
	return r.q.InsertComment(ctx, db.InsertCommentParams{
		ID:                 in.ID,
		PostID:             in.PostID,
		PageID:             stringToUUID(in.PageID),
		FromID:             in.FromID,
		FromName:           in.FromName,
		Message:            in.Message,
		CreatedTime:        timePtrToPgTime(in.CreatedTime),
		LikeCount:          int32(in.LikeCount),
		ReplyCount:         int32(in.ReplyCount),
		Sentiment:          in.Sentiment,
		Intent:             in.Intent,
		Priority:           int32(in.Priority),
		IsHidden:           in.IsHidden,
		IsLiked:            in.IsLiked,
		IsPrivateReplySent: in.IsPrivateReplySent,
		CollectedInfo:      collectedInfoToRaw(in.CollectedInfo),
		ReceivedAt:         timeToPgTime(in.ReceivedAt),
		ClaimedAt:          timePtrToPgTime(in.ClaimedAt),
		ClaimedBy:          in.ClaimedBy,
		Processed:          in.Processed,
	})
}

func (r *commentsRepo) Claim(ctx context.Context, commentID, claimedBy string) (bool, error) {
	return r.q.ClaimComment(ctx, db.ClaimCommentParams{
		PCommentID: commentID,
		PClaimedBy: claimedBy,
	})
}

func (r *commentsRepo) UpdateLiked(ctx context.Context, commentID string, liked bool) error {
	return r.q.UpdateCommentLiked(ctx, db.UpdateCommentLikedParams{
		ID:     commentID,
		IsLiked: liked,
	})
}

func (r *commentsRepo) UpdatePrivateReply(ctx context.Context, commentID string, sent bool) error {
	return r.q.UpdateCommentPrivateReply(ctx, db.UpdateCommentPrivateReplyParams{
		ID:                  commentID,
		IsPrivateReplySent: sent,
	})
}

func (r *commentsRepo) MarkProcessed(ctx context.Context, commentID string) error {
	return r.q.MarkCommentProcessed(ctx, commentID)
}

func (r *commentsRepo) InsertReply(ctx context.Context, in models.CommentReply) error {
	return r.q.InsertCommentReply(ctx, db.InsertCommentReplyParams{
		CommentID:       in.CommentID,
		ReplyType:       in.ReplyType,
		Content:         in.Content,
		SentBy:          in.SentBy,
		Status:          in.Status,
		FacebookReplyID: in.FacebookReplyID,
		SentAt:          timeToPgTime(in.SentAt),
	})
}

func (r *commentsRepo) ListReplies(ctx context.Context, commentID string) ([]models.CommentReply, error) {
	rows, err := r.q.ListCommentReplies(ctx, commentID)
	if err != nil {
		return nil, err
	}
	out := make([]models.CommentReply, 0, len(rows))
	for _, row := range rows {
		out = append(out, commentReplyFromRow(row))
	}
	return out, nil
}

func commentFromRow(r db.FacebookComment) models.Comment {
	return models.Comment{
		ID:                 r.ID,
		PostID:             r.PostID,
		PageID:             uuidToString(r.PageID),
		FromID:             r.FromID,
		FromName:           r.FromName,
		Message:            r.Message,
		CreatedTime:        ptrTime(pgTimeToTime(r.CreatedTime)),
		LikeCount:          int(r.LikeCount),
		ReplyCount:         int(r.ReplyCount),
		Sentiment:          r.Sentiment,
		Intent:             r.Intent,
		Priority:           int(r.Priority),
		IsHidden:           r.IsHidden,
		IsLiked:            r.IsLiked,
		IsPrivateReplySent: r.IsPrivateReplySent,
		CollectedInfo:      rawToCollectedInfo(r.CollectedInfo),
		ReceivedAt:         pgTimeToTime(r.ReceivedAt),
		ClaimedAt:          ptrTime(pgTimeToTime(r.ClaimedAt)),
		ClaimedBy:          r.ClaimedBy,
		Processed:          r.Processed,
	}
}

func commentReplyFromRow(r db.FacebookCommentReply) models.CommentReply {
	return models.CommentReply{
		ID:              uuidToString(r.ID),
		CommentID:       r.CommentID,
		ReplyType:       r.ReplyType,
		Content:         r.Content,
		SentBy:          r.SentBy,
		Status:          r.Status,
		FacebookReplyID: r.FacebookReplyID,
		SentAt:          pgTimeToTime(r.SentAt),
	}
}
