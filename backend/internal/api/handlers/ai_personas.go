package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// AIPersonas is the HTTP adapter for AI persona management.
type AIPersonas struct {
	svc      *service.AIPersonas
	pagesSvc *service.Pages
}

// NewAIPersonas builds the handler.
func NewAIPersonas(svc *service.AIPersonas, pagesSvc *service.Pages) *AIPersonas {
	return &AIPersonas{svc: svc, pagesSvc: pagesSvc}
}

// List returns all AI personas.
func (h *AIPersonas) List(c *gin.Context) {
	list, err := h.svc.List(c.Request.Context())
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, list)
}

// Create adds a new AI persona.
func (h *AIPersonas) Create(c *gin.Context) {
	var in models.AIPersona
	if err := c.ShouldBindJSON(&in); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.Create(c.Request.Context(), in)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// Update modifies an existing AI persona.
func (h *AIPersonas) Update(c *gin.Context) {
	id := c.Param("id")
	var in models.AIPersona
	if err := c.ShouldBindJSON(&in); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	in.ID = id
	out, err := h.svc.Update(c.Request.Context(), in)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "persona not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// Delete removes an AI persona.
func (h *AIPersonas) Delete(c *gin.Context) {
	id := c.Param("id")
	if err := h.svc.Delete(c.Request.Context(), id); err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	c.Status(http.StatusOK)
}

// SetPagePersona assigns a persona to a page.
func (h *AIPersonas) SetPagePersona(c *gin.Context) {
	var req struct {
		PageID     string  `json:"pageId"`
		PersonaID  *string `json:"personaId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	page, err := h.pagesSvc.GetByFBID(c.Request.Context(), req.PageID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "page not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.pagesSvc.SetPageAIPersona(c.Request.Context(), page.ID, req.PersonaID)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}
