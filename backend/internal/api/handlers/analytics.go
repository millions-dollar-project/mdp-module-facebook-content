package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// Analytics is the HTTP adapter for the Analytics service.
type Analytics struct {
	svc *service.Analytics
}

// NewAnalytics builds an Analytics handler.
func NewAnalytics(s *service.Analytics) *Analytics { return &Analytics{svc: s} }

// GetAnalytics GET /api/v1/facebook/analytics?range=7d|30d|90d
func (h *Analytics) GetAnalytics(c *gin.Context) {
	rangeStr := c.Query("range")
	if rangeStr == "" {
		rangeStr = "30d"
	}
	out, err := h.svc.Get(c.Request.Context(), rangeStr)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

// GetDailyStats GET /api/v1/facebook/daily-stats?days=14
func (h *Analytics) GetDailyStats(c *gin.Context) {
	days := int32(14)
	if v := c.Query("days"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 32); err == nil {
			days = int32(n)
		}
	}
	out, err := h.svc.DailyStats(c.Request.Context(), days)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}
