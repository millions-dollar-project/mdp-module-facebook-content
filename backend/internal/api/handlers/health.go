package handlers

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
)

const (
	platform = "facebook"
	version  = "0.1.0"
)

// Health returns DB liveness in addition to the static "ok" envelope.
// 200 when DB is reachable, 503 otherwise. Plugin uses the status field
// to render a green/red dot in the topbar.
func Health(pool *pgxpool.Pool, log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		dbStatus := "up"
		code := http.StatusOK
		pingCtx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if err := pool.Ping(pingCtx); err != nil {
			dbStatus = "down"
			code = http.StatusServiceUnavailable
			log.Warn("health: db ping failed", "err", err)
		}
		c.JSON(code, gin.H{
			"status":    "ok",
			"platform":  platform,
			"version":   version,
			"db":        dbStatus,
			"requestId": middleware.GetRequestID(c),
		})
	}
}
