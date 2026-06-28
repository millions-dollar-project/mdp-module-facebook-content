// Package handlers — gone.go
//
// `Gone` returns a 410 Gone response with the standard `Deprecation` and
// `Link: rel="successor-version"` headers so consumers (browser, fetch
// clients, monitoring) can route to the new kit-accounts endpoints.
//
// Phase 2 of the kit-accounts migration retires the SQL-backed
// `/fb-accounts*` endpoints in favor of the shared `mdp-kit/go/kit-accounts`
// handler at `/api/v1/facebook/kit-accounts`. The routes still resolve so
// legacy clients (and stale dashboard links) get a clear "Gone" rather
// than a 404, and the Link header advertises the successor URL.
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Gone returns a gin.HandlerFunc that responds 410 with the standard
// `Deprecation: true` and `Link: rel="successor-version"` headers.
//
// `message` is included in the JSON body as `{ "error": "Gone", "message": ... }`.
// Both fields are intentional — the generic `error` lets clients pattern-match
// on a stable string while `message` is human-readable for debugging.
func Gone(message string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Deprecation", "true")
		c.Header("Link", "</api/v1/facebook/kit-accounts>; rel=\"successor-version\"")
		c.JSON(http.StatusGone, gin.H{
			"error":   "Gone",
			"message": message,
		})
	}
}