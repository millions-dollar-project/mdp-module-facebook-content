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

// Pages is the HTTP adapter for the Pages service. Holds a pointer
// to the service-layer Pages type (see service/pages.go).
type Pages struct {
	svc *service.Pages
}

// NewPages builds a Pages handler.
func NewPages(s *service.Pages) *Pages { return &Pages{svc: s} }

// List GET /api/v1/facebook/pages
func (h *Pages) List(c *gin.Context) {
	out, err := h.svc.List(c.Request.Context())
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

// addPageReq is the JSON body for POST /add-page.
type addPageReq struct {
	PageID          string  `json:"pageId"`
	PageName        string  `json:"pageName"`
	PageAccessToken string  `json:"pageAccessToken"`
	Category        *string `json:"category,omitempty"`
	AIEnabled       bool    `json:"aiEnabled"`
	PostingEnabled  bool    `json:"postingEnabled"`
}

// Add POST /api/v1/facebook/add-page
func (h *Pages) Add(c *gin.Context) {
	var req addPageReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	in := models.Page{
		PageID:          req.PageID,
		PageName:        req.PageName,
		PageAccessToken: req.PageAccessToken,
		Category:        req.Category,
		IsActive:        true,
		AIEnabled:       req.AIEnabled,
		PostingEnabled:  req.PostingEnabled,
	}
	out, err := h.svc.Add(c.Request.Context(), in)
	if err != nil {
		if errors.Is(err, repo.ErrDuplicate) || errors.Is(err, service.ErrDuplicate) {
			WriteError(c.Writer, c.Request, http.StatusConflict, "duplicate", "page already exists", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// updatePageReq matches the plugin's full Page shape on update.
type updatePageReq struct {
	models.Page
}

// Update POST /api/v1/facebook/update-page
func (h *Pages) Update(c *gin.Context) {
	var req updatePageReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.Update(c.Request.Context(), req.Page)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "page not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// deletePageReq wraps {id}.
type deletePageReq struct {
	ID string `json:"id"`
}

// Delete POST /api/v1/facebook/delete-page
func (h *Pages) Delete(c *gin.Context) {
	var req deletePageReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	if err := h.svc.Delete(c.Request.Context(), req.ID); err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"ok": true})
}

// testPageConnectionReq wraps {pageId} (the FB page id, not our row id).
type testPageConnectionReq struct {
	PageID string `json:"pageId"`
}

// TestConnection POST /api/v1/facebook/test-page-connection
func (h *Pages) TestConnection(c *gin.Context) {
	var req testPageConnectionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.TestConnection(c.Request.Context(), req.PageID)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// togglePagePostingReq wraps {pageId, enabled} where pageId is the
// *Facebook* page id (matches the plugin UI). The handler resolves it
// to the local uuid before calling the service.
type togglePagePostingReq struct {
	PageID  string `json:"pageId"`
	Enabled bool   `json:"enabled"`
}

// updatePersonaReq is the JSON body for POST /update-page-persona.
type updatePersonaReq struct {
	PageID  string                    `json:"pageId"` // Facebook page id
	Persona models.PageInlinePersona  `json:"persona"`
}

// UpdatePersona POST /api/v1/facebook/update-page-persona
func (h *Pages) UpdatePersona(c *gin.Context) {
	var req updatePersonaReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	page, err := h.svc.GetByFBID(c.Request.Context(), req.PageID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "page not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.UpdatePersona(c.Request.Context(), page.ID, req.Persona)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "page not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// TogglePosting POST /api/v1/facebook/toggle-page-posting
func (h *Pages) TogglePosting(c *gin.Context) {
	var req togglePagePostingReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	page, err := h.svc.GetByFBID(c.Request.Context(), req.PageID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "page not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.TogglePosting(c.Request.Context(), page.ID, req.Enabled)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "page not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}

// togglePageAIReq wraps {pageId, enabled}.
type togglePageAIReq struct {
	PageID  string `json:"pageId"`
	Enabled bool   `json:"enabled"`
}

// ToggleAI POST /api/v1/facebook/toggle-page-ai
func (h *Pages) ToggleAI(c *gin.Context) {
	var req togglePageAIReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	page, err := h.svc.GetByFBID(c.Request.Context(), req.PageID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "page not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	out, err := h.svc.ToggleAI(c.Request.Context(), page.ID, req.Enabled)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "page not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, out)
}
