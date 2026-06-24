// Command server is the entry point for the mdp-module-facebook
// backend. It loads config, opens the DB pool, runs migrations, starts
// the scheduled-posts worker goroutine, then serves HTTP until SIGINT
// or SIGTERM, at which point it gracefully drains in-flight requests.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/ai"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/config"
	dbpkg "github.com/millions-dollar-project/mdp-module-facebook/backend/internal/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/secure"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
	sidecarctl "github.com/millions-dollar-project/mdp-module-facebook/backend/internal/sidecar"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/telemetry"
)

func main() {
	// Best-effort load of .env from the current working directory. We
	// intentionally ignore the error: in production the process env is
	// already populated (k8s, systemd, docker --env-file) and a missing
	// .env is not fatal. Real config validation happens in config.Load.
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		// No logger yet — write to stderr in the same JSON shape.
		slog.New(slog.NewJSONHandler(os.Stderr, nil)).
			Error("config load failed", "err", err.Error())
		os.Exit(1)
	}
	log := telemetry.NewLogger(cfg.LogLevel)
	log.Info("starting", "config", cfg.String())

	// Sidecar lifecycle: make sure the Node.js Playwright micro-service is
	// up before we accept traffic that depends on it. In dev this avoids
	// the "click Add account → port 9001 refused → orphan row" trap. In
	// production (k8s/docker) the sidecar is a separate pod, so callers
	// should set SIDECAR_AUTOSTART=false to skip the spawn step.
	sidecarCleanup, err := sidecarctl.EnsureRunning(context.Background(), sidecarctl.Options{
		BaseURL:      cfg.SidecarURL,
		ScriptPath:   cfg.SidecarScriptPath,
		NodeBin:      cfg.SidecarNodeBin,
		Autostart:    cfg.SidecarAutostart,
		StartTimeout: cfg.SidecarStartTimeout,
		Log:          log,
	})
	if err != nil {
		// Don't hard-fail startup: the HTTP server can still serve routes
		// that don't need the sidecar (crawler, scheduler, etc.). Routes
		// that do need it will return a clear 502 when called. The dev
		// sees a loud log line at boot.
		log.Warn("sidecar not available at startup; sidecar-backed routes will 502 until it comes up", "err", err.Error())
	} else {
		defer sidecarCleanup()
	}

	// Migrations first — fail fast if schema is broken.
	if err := dbpkg.RunMigrationsUp(cfg.DatabaseURL); err != nil {
		log.Error("migrations failed", "err", err)
		os.Exit(1)
	}

	// DB pool
	pool, err := dbpkg.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Error("db open failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	log.Info("db connected")

	// Encryption box (no-op when ENCRYPTION_KEY is empty)
	box := secure.NewBox(cfg.EncryptionKey)

	// Repos
	pagesRepo := repo.NewPagesRepo(db.New(pool), box)
	queueRepo := repo.NewQueueRepo(db.New(pool))
	schedRepo := repo.NewSchedulerRepo(db.New(pool))
	postsRepo := repo.NewPostsRepo(db.New(pool))
	configRepo := repo.NewConfigRepo(db.New(pool), box)

	// Graph API client
	graph := fb.NewClient(fb.Config{
		BaseURL:     cfg.GraphAPIBase,
		APIVersion:  cfg.GraphAPIVersion,
		HTTPTimeout: cfg.RequestTimeout,
	})

	// AI / Inbox / Comment monitor deps (also used by router)
	queries := db.New(pool)
	convRepo := repo.NewConversationsRepo(queries)
	msgRepo := repo.NewMessagesRepo(queries)
	commentsRepo := repo.NewCommentsRepo(queries)
	inboxSvc := service.NewInbox(convRepo, msgRepo, pagesRepo, graph, log)
	var commentMonitor *service.CommentMonitor
	if cfg.OpenAIAPIKey != "" {
		aiClient := ai.NewClient(ai.Config{APIKey: cfg.OpenAIAPIKey})
		personasRepo := repo.NewAIPersonasRepo(queries)
		aiSvc := service.NewAIResponder(aiClient, convRepo, msgRepo, inboxSvc, pagesRepo, personasRepo, log)
		commentMonitor = service.NewCommentMonitor(commentsRepo, pagesRepo, graph, aiSvc, log)
	}

	// Scheduled-posts worker
	publisher := service.NewPublisher(graph, postsRepo, pagesRepo, log)
	worker := service.NewWorker(schedRepo, pagesRepo, publisher, cfg.WorkerInterval, log)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	go worker.Run(workerCtx)

	// Comment monitor worker
	if commentMonitor != nil {
		commentWorker := service.NewCommentWorker(commentMonitor, pagesRepo, 60*time.Second, log)
		go commentWorker.Run(workerCtx)
	}

	// HTTP server
	gin.SetMode(gin.ReleaseMode)
	router := api.NewRouter(api.RouterDeps{
		Pool:            pool,
		Pages:           pagesRepo,
		Queue:           queueRepo,
		Sched:           schedRepo,
		Posts:           postsRepo,
		Config:          configRepo,
		Graph:           graph,
		OpenAIKey:       cfg.OpenAIAPIKey,
		AppSecret:       cfg.FacebookAppSecret,
		VerifyToken:     cfg.FacebookVerifyToken,
		SidecarURL:      cfg.SidecarURL,
		Logger:          log,
		CommentMonitor:  commentMonitor,
		BrainBinaryPath: os.Getenv("MDP_BRAIN_BIN"),
	})
	srv := &http.Server{
		Addr:              cfg.Port,
		Handler:           router,
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MiB
	}

	// Run + signal handling
	go func() {
		log.Info("http server listening", "addr", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server stopped unexpectedly", "err", err)
			os.Exit(1)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Info("shutdown signal received", "signal", sig.String())

	// Graceful shutdown — drain HTTP first, then worker, then close pool.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Warn("http server shutdown error", "err", err)
	}
	workerCancel()
	log.Info("shutdown complete")
}
