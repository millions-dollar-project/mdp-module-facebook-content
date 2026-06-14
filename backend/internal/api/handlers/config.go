package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// Config is the HTTP adapter for the Config service.
type Config struct {
	svc *service.Config
}

// NewConfig builds a Config handler.
func NewConfig(s *service.Config) *Config { return &Config{svc: s} }

// Get GET /api/v1/facebook/config — does NOT return appSecret.
func (h *Config) Get(c *gin.Context) {
	out, err := h.svc.Get(c.Request.Context())
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// Save POST /api/v1/facebook/config — body is the same shape as Get,
// with optional appSecret on the way in.
func (h *Config) Save(c *gin.Context) {
	var req service.PublicConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.Save(c.Request.Context(), req)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}
