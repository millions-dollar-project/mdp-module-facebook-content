// Package api wires the HTTP layer: middleware chain, route groups, and
// the NewRouter constructor that cmd/server/main.go calls.
package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/ai"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/handlers"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/mcp"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// apiPrefix is the versioned base path for all module-specific routes.
// Plugin's API_BASE (src/lib/api.ts) is built from this same prefix.
const apiPrefix = "/api/v1/facebook"

// RouterDeps holds the components NewRouter wires together. cmd/server
// builds it once at startup and reuses it across the process lifetime.
type RouterDeps struct {
	Pool            *pgxpool.Pool
	Pages           repo.PagesRepo
	Queue           repo.QueueRepo
	Sched           repo.SchedulerRepo
	Posts           repo.PostsRepo
	Config          repo.ConfigRepo
	Graph           *fb.Client
	OpenAIKey       string
	AppSecret       string
	VerifyToken     string
	SidecarURL      string
	Logger          *slog.Logger
	CommentMonitor  *service.CommentMonitor
	BrainBinaryPath string
	BrainScope      map[string]string // default scope for brain dashboard handlers
}

// NewRouter returns a fully-wired *gin.Engine. Middleware order:
//  1. RequestID — must be first so every other layer can read it
//  2. Recovery  — catches panics in handlers
//  3. CORS      — handle preflight before AccessLog so OPTIONS are cheap
//  4. AccessLog — logs every request (skip noisy /health in Phase 3)
func NewRouter(d RouterDeps) *gin.Engine {
	r := gin.New()
	r.Use(middleware.RequestID())
	r.Use(gin.Recovery())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CORSGin())
	r.Use(middleware.AccessLog(d.Logger))

	// Unversioned probes
	r.GET("/health", handlers.Health(d.Pool, d.Logger))
	r.GET("/healthz", handlers.Health(d.Pool, d.Logger))
	r.GET("/ready", handlers.Readiness())
	r.GET("/metrics", handlers.Metrics())
	r.GET("/me", handlers.Me())

	// Build service layer
	publisher := service.NewPublisher(d.Graph, d.Posts, d.Pages, d.Logger)
	pagesSvc := service.NewPages(d.Pages, d.Graph, d.Logger)
	queueSvc := service.NewQueue(d.Queue, d.Pages, publisher, d.Logger)
	schedSvc := service.NewScheduler(d.Sched, d.Pages, publisher, d.Logger)
	configSvc := service.NewConfig(d.Config)

	queries := db.New(d.Pool)
	convRepo := repo.NewConversationsRepo(queries)
	msgRepo := repo.NewMessagesRepo(queries)
	commentsRepo := repo.NewCommentsRepo(queries)
	webhookRepo := repo.NewWebhookRepo(queries)

	inboxSvc := service.NewInbox(convRepo, msgRepo, d.Pages, d.Graph, d.Logger)
	personasRepo := repo.NewAIPersonasRepo(queries)
	var aiSvc *service.AIResponder
	if d.OpenAIKey != "" {
		aiClient := ai.NewClient(ai.Config{APIKey: d.OpenAIKey})
		aiSvc = service.NewAIResponder(aiClient, convRepo, msgRepo, inboxSvc, d.Pages, personasRepo, d.Logger)
	}
	commentMonitor := d.CommentMonitor
	if commentMonitor == nil && aiSvc != nil {
		commentMonitor = service.NewCommentMonitor(commentsRepo, d.Pages, d.Graph, aiSvc, d.Logger)
	}
	webhookSvc := service.NewWebhook(webhookRepo, inboxSvc, commentMonitor, aiSvc, d.AppSecret, d.VerifyToken, d.Logger)

	// Repost (crawl / spin / group post)
	repostCampaignRepo := repo.NewRepostCampaignRepo(queries)
	repostJobRepo := repo.NewRepostJobRepo(queries)
	fbAccountRepo := repo.NewFBAccountRepo(queries)
	fbGroupRepo := repo.NewFBGroupRepo(queries)
	crawledPostRepo := repo.NewCrawledPostRepo(queries)
	var sidecarClient *service.SidecarClient
	if d.SidecarURL != "" {
		sidecarClient = service.NewSidecarClient(d.SidecarURL)
	}
	var repostSvc *service.RepostCampaignService
	if sidecarClient != nil && d.OpenAIKey != "" {
		aiClient := ai.NewClient(ai.Config{APIKey: d.OpenAIKey})
		repostSvc = service.NewRepostCampaignService(repostCampaignRepo, repostJobRepo, fbAccountRepo, fbGroupRepo, crawledPostRepo, sidecarClient, aiClient)
	}
	repostH := handlers.NewRepostHandler(repostCampaignRepo, repostJobRepo, fbAccountRepo, fbGroupRepo, crawledPostRepo, repostSvc, sidecarClient)

	// Kling AI
	var klingH *handlers.KlingHandler
	if sidecarClient != nil {
		klingH = handlers.NewKlingHandler(sidecarClient)
	}

	// Analytics
	analyticsRepo := repo.NewAnalyticsRepo(queries)
	analyticsSvc := service.NewAnalytics(analyticsRepo)
	analyticsH := handlers.NewAnalytics(analyticsSvc)

	// Brain feed (mdp-brain MCP subprocess). The client only spins up
	// when BrainBinaryPath is non-empty — empty means "brain not
	// installed" and the routes will 503 with a clear message instead
	// of crash-looping on a missing binary.
	brainFeedRepo := repo.NewBrainFeedRepo(queries)
	brainDraftRepo := repo.NewBrainDraftRepo(queries)
	// The repos expose *Row methods that operate on domain models.
	// The service interface wants *string ids, so wrap the repos in
	// thin adapters that close the gap.
	brainFeedStore := brainFeedStoreAdapter{repo: brainFeedRepo}
	brainDraftStore := brainDraftStoreAdapter{repo: brainDraftRepo}
	var brainClient *mcp.BrainClient
	if d.BrainBinaryPath != "" {
		brainClient = mcp.NewBrainClient(d.BrainBinaryPath, 30*time.Second)
	}
	var brainSvc *service.BrainFeedService
	if brainClient != nil {
		brainSvc = service.NewBrainFeedService(brainFeedStore, brainDraftStore, brainClient, 5)
	}
	brainH := handlers.NewBrainFeedHandler(brainSvc, brainSvc, brainSvc)

	// Brain dashboard (overview, peek, personas, learning, feedback, graph).
	// Reuse the same brainClient and repos the feed handler owns. The
	// stats service wraps the count methods the repos already expose.
	brainScope := d.BrainScope
	if brainScope == nil {
		brainScope = map[string]string{"user_id": "default"}
	}
	brainStatsStore := brainStatsStoreAdapter{feeds: brainFeedRepo, drafts: brainDraftRepo}
	brainStatsSvc := service.NewBrainStatsService(brainStatsStore, brainClient, brainScope)
	overviewH := handlers.NewBrainOverviewHandler(brainStatsSvc)
	peekH := handlers.NewBrainPeekHandler(brainFeedRepo, brainDraftRepo, brainClient)
	brainPersonasH := handlers.NewBrainPersonasHandler(brainClient, brainScope)
	learningH := handlers.NewBrainLearningHandler(brainClient, brainScope)
	feedbackH := handlers.NewBrainFeedbackHandler(brainClient)
	graphH := handlers.NewBrainGraphHandler(brainClient, brainScope)

	// Prompts / Hashtags / Video config
	promptsRepo := repo.NewPromptsRepo(queries)
	hashtagsRepo := repo.NewHashtagsRepo(queries)
	videoRepo := repo.NewVideoRepo(queries)
	promptsSvc := service.NewPrompts(promptsRepo)
	hashtagsSvc := service.NewHashtags(hashtagsRepo)
	videoSvc := service.NewVideo(videoRepo)
	promptsH := handlers.NewPrompts(promptsSvc)
	hashtagsH := handlers.NewHashtags(hashtagsSvc)
	videoH := handlers.NewVideo(videoSvc)

	// Resource groups
	v1 := r.Group(apiPrefix)
	{
		pagesH := handlers.NewPages(pagesSvc)
		queueH := handlers.NewQueue(queueSvc)
		schedH := handlers.NewScheduler(schedSvc)
		cfgH := handlers.NewConfig(configSvc)
		pubH := handlers.NewPublish(d.Pages, schedSvc)
		inboxH := handlers.NewInbox(inboxSvc, aiSvc, convRepo)
		commentsH := handlers.NewComments(commentsRepo, d.Pages, d.Graph, commentMonitor)

		// Pages
		v1.GET("/pages", pagesH.List)
		v1.POST("/add-page", pagesH.Add)
		v1.POST("/update-page", pagesH.Update)
		v1.POST("/delete-page", pagesH.Delete)
		v1.POST("/test-page-connection", pagesH.TestConnection)
		v1.POST("/toggle-page-posting", pagesH.TogglePosting)
		v1.POST("/toggle-page-ai", pagesH.ToggleAI)
		v1.POST("/update-page-persona", pagesH.UpdatePersona)

		// AI Personas
		personasSvc := service.NewAIPersonas(personasRepo)
		personasH := handlers.NewAIPersonas(personasSvc, pagesSvc)
		v1.GET("/ai-personas", personasH.List)
		v1.POST("/ai-personas", personasH.Create)
		v1.POST("/ai-personas/:id", personasH.Update)
		v1.DELETE("/ai-personas/:id", personasH.Delete)
		v1.POST("/pages/set-ai-persona", personasH.SetPagePersona)

		// Config
		v1.GET("/config", cfgH.Get)
		v1.POST("/config", cfgH.Save)

		// Prompt templates
		v1.GET("/prompt-templates", promptsH.List)
		v1.POST("/prompt-templates", promptsH.Create)
		v1.POST("/prompt-templates/:id", promptsH.Update)
		v1.DELETE("/prompt-templates/:id", promptsH.Delete)

		// Hashtag bank
		v1.GET("/hashtags", hashtagsH.List)
		v1.POST("/hashtags", hashtagsH.Add)
		v1.DELETE("/hashtags/:tag", hashtagsH.Delete)

		// Video config
		v1.GET("/video-config", videoH.Get)
		v1.POST("/video-config", videoH.Save)

		// Queue
		v1.GET("/content-queue", queueH.List)
		v1.POST("/update-queue-status", queueH.UpdateStatus)
		v1.POST("/publish-now", queueH.PublishNow)
		v1.POST("/regenerate-content", queueH.Regenerate)
		v1.POST("/delete-from-queue", queueH.Delete)

		// Scheduler
		v1.GET("/scheduled-posts", schedH.List)
		v1.POST("/schedule-post", schedH.Schedule)
		v1.POST("/publish-scheduled-now", schedH.PublishNow)
		v1.POST("/cancel-schedule", schedH.Cancel)

		// Publish (immediate, snake_case body)
		v1.POST("/publish", pubH.Publish)

		// Inbox
		v1.POST("/sync-conversations", inboxH.SyncConversations)
		v1.GET("/conversations", inboxH.ListConversations)
		v1.GET("/conversations/:id/messages", inboxH.GetMessages)
		v1.POST("/conversations/:id/send", inboxH.SendMessage)
		v1.POST("/conversations/:id/toggle-ai", inboxH.ToggleAI)
		v1.POST("/conversations/:id/mark-read", inboxH.MarkRead)
		v1.POST("/conversations/:id/reset-ai", inboxH.ResetAI)
		v1.POST("/conversations/scan", inboxH.ScanConversations)

		// Comments
		v1.GET("/comments", commentsH.ListComments)
		v1.POST("/comments/process", commentsH.ProcessComments)
		v1.POST("/comments/:id/like", commentsH.LikeComment)
		v1.POST("/comments/:id/reply", commentsH.ReplyComment)
		v1.POST("/comments/:id/private-reply", commentsH.PrivateReply)

		// Repost campaigns
		v1.GET("/repost-campaigns", repostH.ListCampaigns)
		v1.POST("/repost-campaigns", repostH.CreateCampaign)
		v1.POST("/repost-campaigns/:id/run", repostH.RunCampaign)
		v1.GET("/repost-campaigns/:id/jobs", repostH.GetCampaignJobs)
		v1.POST("/delete-repost-campaign", repostH.DeleteCampaign)

		// Repost V2 (SCA port)
		v1.POST("/crawl-page-v2", repostH.CrawlPageV2)
		v1.POST("/plan-repost", repostH.PlanRepost)
		v1.GET("/repost-queue", repostH.ListQueue)
		v1.POST("/repost-jobs/:id/reschedule", repostH.RescheduleJob)
		v1.POST("/repost-jobs/:id/flags", repostH.SetJobFlags)

		// Crawl
		v1.POST("/crawl", repostH.CrawlPage)
		v1.GET("/crawled-posts", repostH.ListCrawledPosts)

		// FB accounts / groups
		v1.GET("/fb-accounts", repostH.ListAccounts)
		v1.POST("/fb-accounts", repostH.CreateAccount)
		v1.POST("/delete-fb-account", repostH.DeleteAccount)
		v1.POST("/fb-accounts/:id/login", repostH.LoginAccount)
		v1.GET("/fb-accounts/login-status", repostH.AccountLoginStatus)
		v1.GET("/fb-groups", repostH.ListGroups)
		v1.POST("/fb-groups", repostH.CreateGroup)
		v1.POST("/fb-groups/from-url", repostH.CreateGroupFromURL)
		v1.POST("/delete-fb-group", repostH.DeleteGroup)

		// Kling AI
		if klingH != nil {
			v1.POST("/kling/images", klingH.GenerateImages)
			v1.POST("/kling/videos", klingH.GenerateVideos)
		}

		// Analytics
		v1.GET("/analytics", analyticsH.GetAnalytics)
		v1.GET("/daily-stats", analyticsH.GetDailyStats)

		// Brain feed / ingest / generate
		v1.GET("/brain/feed", brainH.List)
		v1.DELETE("/brain/feed/:id", brainH.Delete)
		v1.POST("/brain/ingest", brainH.Ingest)
		v1.POST("/brain/generate", brainH.Generate)

		// Brain dashboard (overview, peek, personas, learning, feedback, graph)
		v1.GET("/brain/overview", overviewH.Get)
		v1.GET("/brain/provenance/:id", peekH.Get)
		v1.GET("/brain/personas", brainPersonasH.List)
		v1.GET("/brain/learning", learningH.List)
		v1.POST("/brain/learning/:id/apply", learningH.Apply)
		v1.POST("/brain/feedback", feedbackH.Create)
		v1.GET("/brain/graph/stats", graphH.Stats)

		// Back-compat with the original skeleton — keep `/posts` for the
		// plugin's historical hooks.
		v1.GET("/posts", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"data": []any{}})
		})
	}

	// Webhook (outside apiPrefix because Facebook calls the root path)
	webhookH := handlers.NewWebhook(webhookSvc)
	r.GET("/webhook", webhookH.VerifyGET)
	r.POST("/webhook", webhookH.ReceivePOST)

	return r
}

// ─── brain feed store adapters ───────────────────────────────────────
//
// The service layer (internal/service) operates on domain models and
// string ids. The repos (internal/repo) take sqlc types and pgtype.UUID
// for the primary key. These tiny adapters close the gap so the router
// can wire the service without leaking pgtype into router.go.

type brainFeedStoreAdapter struct {
	repo *repo.BrainFeedRepo
}

func (a brainFeedStoreAdapter) Upsert(ctx context.Context, row models.BrainFeedRow) (models.BrainFeedRow, error) {
	return a.repo.UpsertRow(ctx, row)
}

func (a brainFeedStoreAdapter) UpdateBrainID(ctx context.Context, id string, brainID string, status string) error {
	return a.repo.UpdateBrainIDRow(ctx, id, brainID, status)
}

func (a brainFeedStoreAdapter) UpdateStatus(ctx context.Context, id string, status string, errMsg string) error {
	return a.repo.UpdateStatusRow(ctx, id, status, errMsg)
}

func (a brainFeedStoreAdapter) GetByID(ctx context.Context, id string) (models.BrainFeedRow, error) {
	return a.repo.GetByIDRow(ctx, id)
}

func (a brainFeedStoreAdapter) List(ctx context.Context, f repo.BrainFeedFilter, page, pageSize int) ([]models.BrainFeedRow, error) {
	return a.repo.ListRows(ctx, f, page, pageSize)
}

func (a brainFeedStoreAdapter) Count(ctx context.Context, f repo.BrainFeedFilter) (int64, error) {
	return a.repo.Count(ctx, f)
}

func (a brainFeedStoreAdapter) Delete(ctx context.Context, id string) error {
	return a.repo.DeleteRow(ctx, id)
}

type brainDraftStoreAdapter struct {
	repo *repo.BrainDraftRepo
}

func (a brainDraftStoreAdapter) Insert(ctx context.Context, row models.BrainDraftRow) (models.BrainDraftRow, error) {
	return a.repo.InsertRow(ctx, row)
}

func (a brainDraftStoreAdapter) MarkPushed(ctx context.Context, id string, kanbanJobID string) error {
	return a.repo.MarkPushed(ctx, pgtypeUUIDFromString(id), kanbanJobID)
}

// pgtypeUUIDFromString mirrors the small helper in repo/helpers.go so
// we do not need to add a public export there for a single call site.
func pgtypeUUIDFromString(s string) pgtype.UUID {
	var id pgtype.UUID
	_ = id.Scan(s)
	return id
}

// brainStatsStoreAdapter wires the two repos that BrainStatsService
// reads through its BrainStatsStore interface.
type brainStatsStoreAdapter struct {
	feeds  *repo.BrainFeedRepo
	drafts *repo.BrainDraftRepo
}

func (a brainStatsStoreAdapter) CountByStatus(ctx context.Context) (map[string]int64, error) {
	return a.feeds.CountByStatus(ctx)
}

func (a brainStatsStoreAdapter) CountDraftsByStatus(ctx context.Context) (map[string]int64, error) {
	return a.drafts.CountDraftsByStatus(ctx)
}
