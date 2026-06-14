package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Me returns the static identity envelope. The plugin uses this to
// confirm the shell is talking to the right module backend.
func Me() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"id":       "facebook",
			"username": "facebook_module",
			"platform": platform,
		})
	}
}
