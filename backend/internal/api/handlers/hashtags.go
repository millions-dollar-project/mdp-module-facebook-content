package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// Hashtags is the HTTP adapter for the Hashtags service.
type Hashtags struct {
	svc *service.Hashtags
}

func NewHashtags(s *service.Hashtags) *Hashtags { return &Hashtags{svc: s} }

func (h *Hashtags) List(c *gin.Context) {
	out, err := h.svc.List(c.Request.Context())
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

func (h *Hashtags) Add(c *gin.Context) {
	var req struct {
		Tag      string `json:"tag"`
		Category string `json:"category,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.Add(c.Request.Context(), req.Tag, req.Category)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

func (h *Hashtags) Delete(c *gin.Context) {
	tag := c.Param("tag")
	if err := h.svc.Delete(c.Request.Context(), tag); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": true})
}
