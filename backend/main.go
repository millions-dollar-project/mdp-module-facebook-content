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
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/config"
	dbpkg "github.com/millions-dollar-project/mdp-module-facebook/backend/internal/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/secure"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/telemetry"

	kitaccounts "github.com/millions-dollar-project/mdp-kit/go/kit-accounts"
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

	// Migrations first — fail fast if schema is broken.
	if err := dbpkg.RunMigrationsUp(cfg.DatabaseURL, log); err != nil {
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

	// Worker. KitLoader + SidecarClient are required for post_type='personal'
// rows (Worker calls sidecar.PostToProfile via the kit account's
// Chromium profile). Both may be nil at startup — in that case
// personal rows fail loudly with a clear error rather than silently
// hanging.
	publisher := service.NewPublisher(graph, postsRepo, pagesRepo, log)
	kitLoader := service.NewKitLoader(kitaccounts.RootFor(kitaccounts.PlatformFacebook))
	var sidecarClient *service.SidecarClient
	if cfg.SidecarURL != "" {
		sidecarClient = service.NewSidecarClient(cfg.SidecarURL)
	}
	worker := service.NewWorker(schedRepo, pagesRepo, publisher, sidecarClient, kitLoader, cfg.WorkerInterval, log)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	go worker.Run(workerCtx)

	// HTTP server
	gin.SetMode(gin.ReleaseMode)
	router := api.NewRouter(api.RouterDeps{
		Pool:          pool,
		Pages:         pagesRepo,
		Queue:         queueRepo,
		Sched:         schedRepo,
		Posts:         postsRepo,
		Config:        configRepo,
		Graph:         graph,
		SidecarURL:    cfg.SidecarURL,
		Logger:        log,
		BrainAIModels: cfg.BrainAIModels,
	})
	srv := &http.Server{
		Addr:              cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
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
