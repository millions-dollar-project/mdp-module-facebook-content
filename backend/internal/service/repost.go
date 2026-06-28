// Package service provides repost campaign orchestration:
// crawl -> spin caption (OpenAI) -> create jobs -> dispatch to sidecar.
package service

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/ai"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// RepostCampaignService orchestrates the full repost pipeline.
type RepostCampaignService struct {
	campaignRepo repo.RepostCampaignRepo
	jobRepo      repo.RepostJobRepo
	accountRepo  repo.FBAccountRepo
	groupRepo    repo.FBGroupRepo
	crawlRepo    repo.CrawledPostRepo
	sidecar      *SidecarClient
	openai       *ai.Client
}

// NewRepostCampaignService wires all dependencies.
func NewRepostCampaignService(
	campaignRepo repo.RepostCampaignRepo,
	jobRepo repo.RepostJobRepo,
	accountRepo repo.FBAccountRepo,
	groupRepo repo.FBGroupRepo,
	crawlRepo repo.CrawledPostRepo,
	sidecar *SidecarClient,
	openai *ai.Client,
) *RepostCampaignService {
	return &RepostCampaignService{
		campaignRepo: campaignRepo,
		jobRepo:      jobRepo,
		accountRepo:  accountRepo,
		groupRepo:    groupRepo,
		crawlRepo:    crawlRepo,
		sidecar:      sidecar,
		openai:       openai,
	}
}

// CreateCampaign creates a campaign from a crawled post, spins the caption, and queues jobs.
func (s *RepostCampaignService) CreateCampaign(ctx context.Context, name, sourceURL, sourceText string, mediaURLs []string, captionStyle string, scheduledAt time.Time) (*models.RepostCampaign, error) {
	// Spin caption via OpenAI
	spun, err := s.spinCaption(ctx, sourceText, captionStyle)
	if err != nil {
		// Fall back to original text
		spun = sourceText
	}

	campaign, err := s.campaignRepo.Create(ctx, models.RepostCampaign{
		Name:                name,
		SourcePostURL:       sourceURL,
		SourcePostText:      spun,
		SourcePostMediaURLs: mediaURLs,
		CaptionStyle:        captionStyle,
		ScheduledAt:         scheduledAt,
		Status:              models.CampaignPending,
	})
	if err != nil {
		return nil, fmt.Errorf("create campaign: %w", err)
	}

	// Build jobs from active accounts and their assigned groups
	accounts, err := s.accountRepo.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("list accounts: %w", err)
	}
	groups, err := s.groupRepo.ListActive(ctx)
	if err != nil {
		return nil, fmt.Errorf("list groups: %w", err)
	}

	var inputs []models.RepostJob
	for _, acc := range accounts {
		if acc.Status != "active" {
			continue
		}
		for _, g := range groups {
			if g.AssignedAccountID != nil && *g.AssignedAccountID == acc.ID {
				inputs = append(inputs, models.RepostJob{
					CampaignID: campaign.ID,
					AccountID:  acc.ID,
					GroupID:    g.GroupID,
					Status:     models.JobPending,
					ScheduledAt: &scheduledAt,
				})
			}
		}
	}
	for _, in := range inputs {
		if _, err := s.jobRepo.Create(ctx, in); err != nil {
			// Log but continue
			continue
		}
	}

	return &campaign, nil
}

// CrawlPage asks the sidecar to scrape a source page and stores results.
// This is the legacy v1 entry point that doesn't take an untilDate —
// callers wanting date filtering should use CrawlPageV2 instead.
func (s *RepostCampaignService) CrawlPage(ctx context.Context, pageURL string, pageID string, limit int) ([]models.CrawledPost, error) {
	posts, err := s.sidecar.CrawlPage(ctx, pageURL, limit, nil, "")
	if err != nil {
		return nil, fmt.Errorf("sidecar crawl: %w", err)
	}
	out := make([]models.CrawledPost, 0, len(posts))
	for _, p := range posts {
		var postedAt *time.Time
		if t, err := time.Parse(time.RFC3339, p.PostedAt); err == nil {
			postedAt = &t
		}
		cp, err := s.crawlRepo.Create(ctx, models.CrawledPost{
			PageID:        pageID,
			SourceURL:     p.Permalink,
			FbPostID:      &p.ID,
			Content:       &p.FullContent,
			MediaURLs:     p.MediaURLs,
			VideoURLs:     p.VideoURLs,
			ThumbnailURLs: p.ThumbnailURLs,
			FullPicture:   p.FullPicture,
			MediaType:     p.MediaType,
			Likes:         p.Likes,
			Comments:      p.Comments,
			Shares:        p.Shares,
			ReactionIcons: p.ReactionIcons,
			PostedAt:      postedAt,
			Permalink:     &p.Permalink,
		})
		if err != nil {
			continue
		}
		out = append(out, cp)
	}
	return out, nil
}

// RunCampaign executes pending jobs for a campaign via the sidecar.
func (s *RepostCampaignService) RunCampaign(ctx context.Context, campaignID string) error {
	campaign, err := s.campaignRepo.Get(ctx, campaignID)
	if err != nil {
		return err
	}
	if campaign.Status != models.CampaignPending && campaign.Status != models.CampaignRunning {
		return fmt.Errorf("campaign %s not runnable (status=%s)", campaignID, campaign.Status)
	}

	now := time.Now().UTC()
	if err := s.campaignRepo.UpdateStatus(ctx, campaignID, models.CampaignRunning, &now, nil, nil); err != nil {
		return err
	}

	jobs, err := s.jobRepo.ListPendingForCampaign(ctx, campaignID)
	if err != nil {
		return err
	}
	if len(jobs) == 0 {
		_ = s.campaignRepo.UpdateStatus(ctx, campaignID, models.CampaignCompleted, nil, &now, nil)
		return nil
	}

	completed := 0
	failed := 0
	for _, job := range jobs {
		acc, err := s.accountRepo.Get(ctx, job.AccountID)
		if err != nil || acc.Status != "active" {
			_ = s.jobRepo.UpdateStatus(ctx, job.ID, models.JobFailed, job.Attempts+1, strPtr("Account inactive"), nil, &now, nil)
			failed++
			continue
		}

		// Check group access before posting
		access, err := s.sidecar.CheckGroupAccess(ctx, acc.ProfilePath, job.GroupID)
		if err != nil || access == nil || !access.CanPost {
			reason := "Group access denied"
			if access != nil && access.Status == "needs_join" {
				reason = "Account not joined group"
			}
			_ = s.jobRepo.UpdateStatus(ctx, job.ID, models.JobFailed, job.Attempts+1, &reason, nil, &now, nil)
			failed++
			continue
		}

		result, err := s.sidecar.PostToGroup(ctx, acc.ProfilePath, job.GroupID, campaign.SourcePostText, campaign.SourcePostMediaURLs, job.AnonymousPosting)
		if err != nil || result == nil || !result.Success {
			reason := "Post failed"
			if result != nil && result.Error != "" {
				reason = result.Error
			} else if err != nil {
				reason = err.Error()
			}
			_ = s.jobRepo.UpdateStatus(ctx, job.ID, models.JobFailed, job.Attempts+1, &reason, nil, &now, nil)
			failed++
			continue
		}

		_ = s.jobRepo.UpdateStatus(ctx, job.ID, models.JobCompleted, job.Attempts+1, nil, &result.PostURL, &now, &now)
		completed++

		// Random delay between groups (2-5 min)
		delay := 2*60*1000 + rand.Intn(3*60*1000)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(delay) * time.Millisecond):
		}
	}

	finalStatus := models.CampaignCompleted
	if failed > 0 && completed == 0 {
		finalStatus = models.CampaignFailed
	} else if failed > 0 {
		finalStatus = models.CampaignFailed
	}
	_ = s.campaignRepo.UpdateStatus(ctx, campaignID, finalStatus, nil, &now, strPtr(fmt.Sprintf("completed=%d failed=%d", completed, failed)))
	return nil
}

// spinCaption asks OpenAI to rewrite a caption in the given style.
func (s *RepostCampaignService) spinCaption(ctx context.Context, original, style string) (string, error) {
	if style == "" || style == "original" || style == "none" || style == "keep" {
		return original, nil
	}
	if s.openai == nil {
		return "", fmt.Errorf("caption spinning requires OPENAI_API_KEY but none is configured")
	}
	prompt := fmt.Sprintf(`Bạn là chuyên gia viết caption Facebook tiếng Việt. Viết lại nội dung gốc theo phong cách yêu cầu.

Phong cách: %s

Nội dung gốc:
"""
%s
"""

Yêu cầu:
- Giữ nguyên ý chính
- Thêm emoji phù hợp (1-3 emoji)
- Không hashtag spam
- Trả về CHỈ caption viết lại, không giải thích

Caption viết lại:`, style, original)

	resp, err := s.openai.Complete(ctx, ai.CompletionRequest{
		Messages:    []ai.Message{{Role: "user", Content: prompt}},
		Temperature: 0.8,
		MaxTokens:   500,
	})
	if err != nil {
		return "", err
	}
	return resp, nil
}

func strPtr(s string) *string { return &s }
