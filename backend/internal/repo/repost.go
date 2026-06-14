package repo

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// RepostCampaignRepo is the contract for repost campaign data access.
type RepostCampaignRepo interface {
	Create(ctx context.Context, in models.RepostCampaign) (models.RepostCampaign, error)
	List(ctx context.Context) ([]models.RepostCampaign, error)
	Get(ctx context.Context, id string) (models.RepostCampaign, error)
	GetDue(ctx context.Context, now, notBefore time.Time) ([]models.RepostCampaign, error)
	UpdateStatus(ctx context.Context, id string, status string, startedAt, completedAt *time.Time, lastError *string) error
	Reschedule(ctx context.Context, id string, scheduledAt time.Time) error
	ExpireOverdue(ctx context.Context, cutoff time.Time) error
	Delete(ctx context.Context, id string) error
}

type repostCampaignRepo struct{ q *db.Queries }

// NewRepostCampaignRepo wires a Postgres-backed repost campaign repo.
func NewRepostCampaignRepo(q *db.Queries) RepostCampaignRepo { return &repostCampaignRepo{q: q} }

func (r *repostCampaignRepo) Create(ctx context.Context, in models.RepostCampaign) (models.RepostCampaign, error) {
	row, err := r.q.CreateCampaign(ctx, db.CreateCampaignParams{
		Name:                in.Name,
		SourcePostUrl:       in.SourcePostURL,
		SourcePostText:      in.SourcePostText,
		SourcePostMediaUrls: stringSliceToBytes(in.SourcePostMediaURLs),
		CaptionStyle:        in.CaptionStyle,
		ScheduledAt:         timeToPgTime(in.ScheduledAt),
	})
	if err != nil {
		return models.RepostCampaign{}, err
	}
	return campaignFromRow(row), nil
}

func (r *repostCampaignRepo) List(ctx context.Context) ([]models.RepostCampaign, error) {
	rows, err := r.q.ListCampaigns(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]models.RepostCampaign, 0, len(rows))
	for _, row := range rows {
		out = append(out, campaignFromRow(row))
	}
	return out, nil
}

func (r *repostCampaignRepo) Get(ctx context.Context, id string) (models.RepostCampaign, error) {
	row, err := r.q.GetCampaign(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.RepostCampaign{}, ErrNotFound
		}
		return models.RepostCampaign{}, err
	}
	return campaignFromRow(row), nil
}

func (r *repostCampaignRepo) GetDue(ctx context.Context, now, notBefore time.Time) ([]models.RepostCampaign, error) {
	rows, err := r.q.GetDueCampaigns(ctx, db.GetDueCampaignsParams{
		ScheduledAt:   timeToPgTime(now),
		ScheduledAt_2: timeToPgTime(notBefore),
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.RepostCampaign, 0, len(rows))
	for _, row := range rows {
		out = append(out, campaignFromRow(row))
	}
	return out, nil
}

func (r *repostCampaignRepo) UpdateStatus(ctx context.Context, id string, status string, startedAt, completedAt *time.Time, lastError *string) error {
	return r.q.UpdateCampaignStatus(ctx, db.UpdateCampaignStatusParams{
		ID:          stringToUUID(id),
		Status:      status,
		StartedAt:   timePtrToPgTime(startedAt),
		CompletedAt: timePtrToPgTime(completedAt),
		LastError:   lastError,
	})
}

func (r *repostCampaignRepo) Reschedule(ctx context.Context, id string, scheduledAt time.Time) error {
	return r.q.RescheduleCampaign(ctx, db.RescheduleCampaignParams{
		ID:          stringToUUID(id),
		ScheduledAt: timeToPgTime(scheduledAt),
	})
}

func (r *repostCampaignRepo) ExpireOverdue(ctx context.Context, cutoff time.Time) error {
	return r.q.ExpireOverdueCampaigns(ctx, timeToPgTime(cutoff))
}

func (r *repostCampaignRepo) Delete(ctx context.Context, id string) error {
	return r.q.DeleteCampaign(ctx, stringToUUID(id))
}

func campaignFromRow(r db.FacebookRepostCampaign) models.RepostCampaign {
	return models.RepostCampaign{
		ID:                  uuidToString(r.ID),
		Name:                r.Name,
		SourcePostURL:       r.SourcePostUrl,
		SourcePostText:      r.SourcePostText,
		SourcePostMediaURLs: bytesToStringSlice(r.SourcePostMediaUrls),
		CaptionStyle:        r.CaptionStyle,
		ScheduledAt:         pgTimeToTime(r.ScheduledAt),
		Status:              r.Status,
		CreatedAt:           pgTimeToTime(r.CreatedAt),
		StartedAt:           ptrTime(pgTimeToTime(r.StartedAt)),
		CompletedAt:         ptrTime(pgTimeToTime(r.CompletedAt)),
		LastError:           r.LastError,
	}
}

// RepostJobRepo is the contract for repost job data access.
type RepostJobRepo interface {
	Create(ctx context.Context, in models.RepostJob) (models.RepostJob, error)
	ListForCampaign(ctx context.Context, campaignID string) ([]models.RepostJob, error)
	ListPendingForCampaign(ctx context.Context, campaignID string) ([]models.RepostJob, error)
	ListAll(ctx context.Context, f models.QueueFilter) ([]models.RepostJob, error)
	UpdateStatus(ctx context.Context, id string, status string, attempts int, lastError, postURL *string, startedAt, completedAt *time.Time) error
	Update(ctx context.Context, id string, scheduledAt *time.Time, autoEnabled, anonymousPosting bool) error
	RescheduleForCampaign(ctx context.Context, campaignID string, scheduledAt time.Time) error
	EnableAutoForAccount(ctx context.Context, accountID string, anonymousPosting bool) error
	DisableAutoForAccount(ctx context.Context, accountID string) error
	ExpireOverdue(ctx context.Context, cutoff time.Time) error
}

type repostJobRepo struct{ q *db.Queries }

// NewRepostJobRepo wires a Postgres-backed repost job repo.
func NewRepostJobRepo(q *db.Queries) RepostJobRepo { return &repostJobRepo{q: q} }

func (r *repostJobRepo) Create(ctx context.Context, in models.RepostJob) (models.RepostJob, error) {
	row, err := r.q.CreateJob(ctx, db.CreateJobParams{
		CampaignID:       stringToUUID(in.CampaignID),
		AccountID:        stringToUUID(in.AccountID),
		GroupID:          in.GroupID,
		ScheduledAt:      timePtrToPgTime(in.ScheduledAt),
		AnonymousPosting: in.AnonymousPosting,
		AutoEnabled:      in.AutoEnabled,
	})
	if err != nil {
		return models.RepostJob{}, err
	}
	return jobFromRow(row), nil
}

func (r *repostJobRepo) ListForCampaign(ctx context.Context, campaignID string) ([]models.RepostJob, error) {
	rows, err := r.q.ListJobsForCampaign(ctx, stringToUUID(campaignID))
	if err != nil {
		return nil, err
	}
	out := make([]models.RepostJob, 0, len(rows))
	for _, row := range rows {
		out = append(out, jobFromRow(row))
	}
	return out, nil
}

func (r *repostJobRepo) ListPendingForCampaign(ctx context.Context, campaignID string) ([]models.RepostJob, error) {
	rows, err := r.q.ListPendingJobsForCampaign(ctx, stringToUUID(campaignID))
	if err != nil {
		return nil, err
	}
	out := make([]models.RepostJob, 0, len(rows))
	for _, row := range rows {
		out = append(out, jobFromRow(row))
	}
	return out, nil
}

func (r *repostJobRepo) UpdateStatus(ctx context.Context, id string, status string, attempts int, lastError, postURL *string, startedAt, completedAt *time.Time) error {
	return r.q.UpdateJobStatus(ctx, db.UpdateJobStatusParams{
		ID:          stringToUUID(id),
		Status:      status,
		Attempts:    int32(attempts),
		LastError:   lastError,
		PostUrl:     postURL,
		StartedAt:   timePtrToPgTime(startedAt),
		CompletedAt: timePtrToPgTime(completedAt),
	})
}

func (r *repostJobRepo) RescheduleForCampaign(ctx context.Context, campaignID string, scheduledAt time.Time) error {
	return r.q.RescheduleJobsForCampaign(ctx, db.RescheduleJobsForCampaignParams{
		CampaignID:  stringToUUID(campaignID),
		ScheduledAt: timeToPgTime(scheduledAt),
	})
}

func (r *repostJobRepo) EnableAutoForAccount(ctx context.Context, accountID string, anonymousPosting bool) error {
	return r.q.EnableAutoForAccountJobs(ctx, db.EnableAutoForAccountJobsParams{
		AccountID:        stringToUUID(accountID),
		AnonymousPosting: anonymousPosting,
	})
}

func (r *repostJobRepo) DisableAutoForAccount(ctx context.Context, accountID string) error {
	return r.q.DisableAutoForAccountJobs(ctx, stringToUUID(accountID))
}

func (r *repostJobRepo) ExpireOverdue(ctx context.Context, cutoff time.Time) error {
	return r.q.ExpireOverdueJobs(ctx, timeToPgTime(cutoff))
}

// ListAll is the queue-view counterpart to ListForCampaign. It returns
// jobs across all campaigns, optionally filtered by status/account/group.
func (r *repostJobRepo) ListAll(ctx context.Context, f models.QueueFilter) ([]models.RepostJob, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 200
	}
	var accountUUID pgtype.UUID
	if f.AccountID != "" {
		accountUUID = stringToUUID(f.AccountID)
	}
	rows, err := r.q.ListAllJobs(ctx, db.ListAllJobsParams{
		Column1: f.Status,
		Column2: accountUUID,
		Column3: f.GroupID,
		Limit:   int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]models.RepostJob, 0, len(rows))
	for _, row := range rows {
		out = append(out, jobFromRow(row))
	}
	return out, nil
}

// Update applies the per-job edit (schedule time + flags). Failed/expired
// jobs are reset to pending so the scheduler picks them up again.
func (r *repostJobRepo) Update(ctx context.Context, id string, scheduledAt *time.Time, autoEnabled, anonymousPosting bool) error {
	return r.q.UpdateJob(ctx, db.UpdateJobParams{
		ID:               stringToUUID(id),
		ScheduledAt:      timePtrToPgTime(scheduledAt),
		AutoEnabled:      autoEnabled,
		AnonymousPosting: anonymousPosting,
	})
}

func jobFromRow(r db.FacebookRepostJob) models.RepostJob {
	return models.RepostJob{
		ID:               uuidToString(r.ID),
		CampaignID:       uuidToString(r.CampaignID),
		AccountID:        uuidToString(r.AccountID),
		GroupID:          r.GroupID,
		Status:           r.Status,
		Attempts:         int(r.Attempts),
		LastError:        r.LastError,
		PostURL:          r.PostUrl,
		ScheduledAt:      ptrTime(pgTimeToTime(r.ScheduledAt)),
		AnonymousPosting: r.AnonymousPosting,
		AutoEnabled:      r.AutoEnabled,
		StartedAt:        ptrTime(pgTimeToTime(r.StartedAt)),
		CompletedAt:      ptrTime(pgTimeToTime(r.CompletedAt)),
		CreatedAt:        pgTimeToTime(r.CreatedAt),
		UpdatedAt:        pgTimeToTime(r.UpdatedAt),
	}
}

// CrawledPostRepo is the contract for crawled post data access.
type CrawledPostRepo interface {
	Create(ctx context.Context, in models.CrawledPost) (models.CrawledPost, error)
	ListForPage(ctx context.Context, pageID string) ([]models.CrawledPost, error)
	ListSelectedForPage(ctx context.Context, pageID string) ([]models.CrawledPost, error)
	SetSelected(ctx context.Context, id string, selected bool) error
	DeleteForPage(ctx context.Context, pageID string) error
}

type crawledPostRepo struct{ q *db.Queries }

// NewCrawledPostRepo wires a Postgres-backed crawled post repo.
func NewCrawledPostRepo(q *db.Queries) CrawledPostRepo { return &crawledPostRepo{q: q} }

func (r *crawledPostRepo) Create(ctx context.Context, in models.CrawledPost) (models.CrawledPost, error) {
	row, err := r.q.CreateCrawledPost(ctx, db.CreateCrawledPostParams{
		PageID:        in.PageID,
		SourceUrl:     in.SourceURL,
		FbPostID:      in.FbPostID,
		Content:       in.Content,
		MediaUrls:     stringSliceToBytes(in.MediaURLs),
		VideoUrls:     stringSliceToBytes(in.VideoURLs),
		ThumbnailUrls: stringSliceToBytes(in.ThumbnailURLs),
		FullPicture:   in.FullPicture,
		MediaType:     in.MediaType,
		Likes:         int32(in.Likes),
		Comments:      int32(in.Comments),
		Shares:        int32(in.Shares),
		ReactionIcons: stringSliceToBytes(in.ReactionIcons),
		PostedAt:      timePtrToPgTime(in.PostedAt),
		Permalink:     in.Permalink,
	})
	if err != nil {
		return models.CrawledPost{}, err
	}
	return crawledPostFromRow(row), nil
}

func (r *crawledPostRepo) ListForPage(ctx context.Context, pageID string) ([]models.CrawledPost, error) {
	rows, err := r.q.ListCrawledPostsForPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	out := make([]models.CrawledPost, 0, len(rows))
	for _, row := range rows {
		out = append(out, crawledPostFromRow(row))
	}
	return out, nil
}

func (r *crawledPostRepo) ListSelectedForPage(ctx context.Context, pageID string) ([]models.CrawledPost, error) {
	rows, err := r.q.ListSelectedCrawledPosts(ctx, pageID)
	if err != nil {
		return nil, err
	}
	out := make([]models.CrawledPost, 0, len(rows))
	for _, row := range rows {
		out = append(out, crawledPostFromRow(row))
	}
	return out, nil
}

func (r *crawledPostRepo) SetSelected(ctx context.Context, id string, selected bool) error {
	return r.q.SetCrawledPostSelected(ctx, db.SetCrawledPostSelectedParams{
		ID:         stringToUUID(id),
		IsSelected: selected,
	})
}

func (r *crawledPostRepo) DeleteForPage(ctx context.Context, pageID string) error {
	return r.q.DeleteCrawledPostsForPage(ctx, pageID)
}

func crawledPostFromRow(r db.FacebookCrawledPost) models.CrawledPost {
	return models.CrawledPost{
		ID:            uuidToString(r.ID),
		PageID:        r.PageID,
		SourceURL:     r.SourceUrl,
		FbPostID:      r.FbPostID,
		Content:       r.Content,
		MediaURLs:     bytesToStringSlice(r.MediaUrls),
		VideoURLs:     bytesToStringSlice(r.VideoUrls),
		ThumbnailURLs: bytesToStringSlice(r.ThumbnailUrls),
		FullPicture:   r.FullPicture,
		MediaType:     r.MediaType,
		Likes:         int(r.Likes),
		Comments:      int(r.Comments),
		Shares:        int(r.Shares),
		ReactionIcons: bytesToStringSlice(r.ReactionIcons),
		PostedAt:      ptrTime(pgTimeToTime(r.PostedAt)),
		Permalink:     r.Permalink,
		IsSelected:    r.IsSelected,
		CreatedAt:     pgTimeToTime(r.CreatedAt),
	}
}

// FBAccountRepo is the contract for FB account data access.
type FBAccountRepo interface {
	Create(ctx context.Context, in models.FBAccount) (models.FBAccount, error)
	List(ctx context.Context) ([]models.FBAccount, error)
	Get(ctx context.Context, id string) (models.FBAccount, error)
	UpdateStatus(ctx context.Context, id string, status string, lastUsedAt *time.Time) error
	Delete(ctx context.Context, id string) error
}

type fbAccountRepo struct{ q *db.Queries }

// NewFBAccountRepo wires a Postgres-backed FB account repo.
func NewFBAccountRepo(q *db.Queries) FBAccountRepo { return &fbAccountRepo{q: q} }

func (r *fbAccountRepo) Create(ctx context.Context, in models.FBAccount) (models.FBAccount, error) {
	var cookies []byte
	if in.CookiesJSON != nil {
		cookies = []byte(*in.CookiesJSON)
	}
	row, err := r.q.CreateAccount(ctx, db.CreateAccountParams{
		Name:        in.Name,
		Email:       in.Email,
		ProfilePath:  in.ProfilePath,
		CookiesJson:  cookies,
	})
	if err != nil {
		return models.FBAccount{}, err
	}
	return fbAccountFromRow(row), nil
}

func (r *fbAccountRepo) List(ctx context.Context) ([]models.FBAccount, error) {
	rows, err := r.q.ListAccounts(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]models.FBAccount, 0, len(rows))
	for _, row := range rows {
		out = append(out, fbAccountFromRow(row))
	}
	return out, nil
}

func (r *fbAccountRepo) Get(ctx context.Context, id string) (models.FBAccount, error) {
	row, err := r.q.GetAccount(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.FBAccount{}, ErrNotFound
		}
		return models.FBAccount{}, err
	}
	return fbAccountFromRow(row), nil
}

func (r *fbAccountRepo) UpdateStatus(ctx context.Context, id string, status string, lastUsedAt *time.Time) error {
	return r.q.UpdateAccountStatus(ctx, db.UpdateAccountStatusParams{
		ID:         stringToUUID(id),
		Status:     status,
		LastUsedAt: timePtrToPgTime(lastUsedAt),
	})
}

func (r *fbAccountRepo) Delete(ctx context.Context, id string) error {
	return r.q.DeleteAccount(ctx, stringToUUID(id))
}

func fbAccountFromRow(r db.FacebookFbAccount) models.FBAccount {
	var cookies *string
	if len(r.CookiesJson) > 0 {
		cs := string(r.CookiesJson)
		cookies = &cs
	}
	return models.FBAccount{
		ID:          uuidToString(r.ID),
		Name:        r.Name,
		Email:       r.Email,
		ProfilePath: r.ProfilePath,
		CookiesJSON: cookies,
		Status:      r.Status,
		LastUsedAt:  ptrTime(pgTimeToTime(r.LastUsedAt)),
		CreatedAt:   pgTimeToTime(r.CreatedAt),
	}
}

// FBGroupRepo is the contract for FB group data access.
type FBGroupRepo interface {
	Create(ctx context.Context, in models.FBGroup) (models.FBGroup, error)
	List(ctx context.Context) ([]models.FBGroup, error)
	ListActive(ctx context.Context) ([]models.FBGroup, error)
	Get(ctx context.Context, id string) (models.FBGroup, error)
	Update(ctx context.Context, in models.FBGroup) error
	Delete(ctx context.Context, id string) error
}

type fbGroupRepo struct{ q *db.Queries }

// NewFBGroupRepo wires a Postgres-backed FB group repo.
func NewFBGroupRepo(q *db.Queries) FBGroupRepo { return &fbGroupRepo{q: q} }

func (r *fbGroupRepo) Create(ctx context.Context, in models.FBGroup) (models.FBGroup, error) {
	var accID pgtype.UUID
	if in.AssignedAccountID != nil {
		accID = stringToUUID(*in.AssignedAccountID)
	}
	row, err := r.q.CreateGroup(ctx, db.CreateGroupParams{
		GroupID:           in.GroupID,
		Name:              in.Name,
		AssignedAccountID: accID,
		Status:            in.Status,
	})
	if err != nil {
		return models.FBGroup{}, err
	}
	return fbGroupFromRow(row), nil
}

func (r *fbGroupRepo) List(ctx context.Context) ([]models.FBGroup, error) {
	rows, err := r.q.ListGroups(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]models.FBGroup, 0, len(rows))
	for _, row := range rows {
		out = append(out, fbGroupFromRow(row))
	}
	return out, nil
}

func (r *fbGroupRepo) ListActive(ctx context.Context) ([]models.FBGroup, error) {
	rows, err := r.q.ListActiveGroups(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]models.FBGroup, 0, len(rows))
	for _, row := range rows {
		out = append(out, fbGroupFromRow(row))
	}
	return out, nil
}

func (r *fbGroupRepo) Get(ctx context.Context, id string) (models.FBGroup, error) {
	row, err := r.q.GetGroup(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.FBGroup{}, ErrNotFound
		}
		return models.FBGroup{}, err
	}
	return fbGroupFromRow(row), nil
}

func (r *fbGroupRepo) Update(ctx context.Context, in models.FBGroup) error {
	var accID pgtype.UUID
	if in.AssignedAccountID != nil {
		accID = stringToUUID(*in.AssignedAccountID)
	}
	return r.q.UpdateGroup(ctx, db.UpdateGroupParams{
		ID:                stringToUUID(in.ID),
		Name:              in.Name,
		AssignedAccountID: accID,
		Status:            in.Status,
		LastPostedAt:      timePtrToPgTime(in.LastPostedAt),
	})
}

func (r *fbGroupRepo) Delete(ctx context.Context, id string) error {
	return r.q.DeleteGroup(ctx, stringToUUID(id))
}

func fbGroupFromRow(r db.FacebookFbGroup) models.FBGroup {
	var accID *string
	if r.AssignedAccountID.Valid {
		s := uuidToString(r.AssignedAccountID)
		accID = &s
	}
	return models.FBGroup{
		ID:                uuidToString(r.ID),
		GroupID:           r.GroupID,
		Name:              r.Name,
		AssignedAccountID: accID,
		Status:            r.Status,
		LastPostedAt:      ptrTime(pgTimeToTime(r.LastPostedAt)),
		CreatedAt:         pgTimeToTime(r.CreatedAt),
	}
}
