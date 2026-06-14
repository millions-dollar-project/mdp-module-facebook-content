// Package handlers exposes Kling AI generation endpoints.
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// KlingHandler holds the Kling HTTP adapter.
type KlingHandler struct {
	sidecar *service.SidecarClient
}

// NewKlingHandler wires dependencies.
func NewKlingHandler(sidecar *service.SidecarClient) *KlingHandler {
	return &KlingHandler{sidecar: sidecar}
}

// GenerateImages godoc
// @Summary Generate images via Kling AI
// @Tags kling
func (h *KlingHandler) GenerateImages(c *gin.Context) {
	var req struct {
		Prompt  string            `json:"prompt" binding:"required"`
		Count   int               `json:"count"`
		Options map[string]string `json:"options"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Count <= 0 {
		req.Count = 1
	}
	paths, err := h.sidecar.GenerateKlingImages(c.Request.Context(), req.Prompt, req.Count, req.Options)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"paths": paths})
}

// GenerateVideos godoc
// @Summary Generate videos via Kling AI
// @Tags kling
func (h *KlingHandler) GenerateVideos(c *gin.Context) {
	var req struct {
		Prompt  string            `json:"prompt" binding:"required"`
		Count   int               `json:"count"`
		Options map[string]string `json:"options"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Count <= 0 {
		req.Count = 1
	}
	paths, err := h.sidecar.GenerateKlingVideos(c.Request.Context(), req.Prompt, req.Count, req.Options)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"paths": paths})
}
