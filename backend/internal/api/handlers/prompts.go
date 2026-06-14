package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// Prompts is the HTTP adapter for the Prompts service.
type Prompts struct {
	svc *service.Prompts
}

func NewPrompts(s *service.Prompts) *Prompts { return &Prompts{svc: s} }

func (h *Prompts) List(c *gin.Context) {
	category := c.Query("category")
	out, err := h.svc.List(c.Request.Context(), category)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

func (h *Prompts) Create(c *gin.Context) {
	var req service.PromptTemplate
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.Create(c.Request.Context(), req)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

func (h *Prompts) Update(c *gin.Context) {
	id := c.Param("id")
	var req service.PromptTemplate
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.Update(c.Request.Context(), id, req)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

func (h *Prompts) Delete(c *gin.Context) {
	id := c.Param("id")
	if err := h.svc.Delete(c.Request.Context(), id); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": true})
}
