package middleware

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORSGin returns a Gin-native CORS middleware. It allows the local
// vite dev server by default, plus any origin listed in
// CORS_ALLOWED_ORIGINS (comma-separated).
//
// This replaces the stdlib-only version in cors.go, which was left over
// from the original single-file main.go skeleton. Use this one in the
// Gin router (api.NewRouter).
func CORSGin() gin.HandlerFunc {
	allowed := map[string]bool{
		"http://localhost:5173": true,
		"http://127.0.0.1:5173": true,
	}
	if v := os.Getenv("CORS_ALLOWED_ORIGINS"); v != "" {
		for _, a := range strings.Split(v, ",") {
			allowed[strings.TrimSpace(a)] = true
		}
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowed[origin] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
			c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
			c.Writer.Header().Set("Access-Control-Max-Age", "600")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
