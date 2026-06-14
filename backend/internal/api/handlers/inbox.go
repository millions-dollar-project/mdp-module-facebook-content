package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// Inbox is the HTTP adapter for Messenger conversations and messages.
type Inbox struct {
	svc       *service.Inbox
	ai        *service.AIResponder
	convRepo  repo.ConversationsRepo
}

// NewInbox builds the handler.
func NewInbox(svc *service.Inbox, ai *service.AIResponder, conv repo.ConversationsRepo) *Inbox {
	return &Inbox{svc: svc, ai: ai, convRepo: conv}
}

// ListConversations GET /api/v1/facebook/conversations?pageId=...
func (h *Inbox) ListConversations(c *gin.Context) {
	pageID := c.Query("pageId")
	if pageID == "" {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", "pageId is required", middleware.GetRequestID(c))
		return
	}
	out, err := h.convRepo.ListByPage(c.Request.Context(), pageID, 50)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

// GetMessages GET /api/v1/facebook/conversations/:id/messages
func (h *Inbox) GetMessages(c *gin.Context) {
	convID := c.Param("id")
	msgs, err := h.svc.GetMessages(c.Request.Context(), convID, 50)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": msgs})
}

// sendMessageReq is the body for POST /conversations/:id/send.
type sendMessageReq struct {
	Text string `json:"text"`
}

// SendMessage POST /api/v1/facebook/conversations/:id/send
func (h *Inbox) SendMessage(c *gin.Context) {
	var req sendMessageReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	convID := c.Param("id")
	mid, err := h.svc.SendMessage(c.Request.Context(), convID, req.Text, false)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "conversation not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"messageId": mid})
}

// ToggleAI POST /api/v1/facebook/conversations/:id/toggle-ai
func (h *Inbox) ToggleAI(c *gin.Context) {
	var req struct{ Enabled bool `json:"enabled"` }
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	convID := c.Param("id")
	if err := h.convRepo.ToggleAI(c.Request.Context(), convID, req.Enabled); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "conversation not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"ok": true})
}

// MarkRead POST /api/v1/facebook/conversations/:id/mark-read
func (h *Inbox) MarkRead(c *gin.Context) {
	convID := c.Param("id")
	if err := h.convRepo.MarkRead(c.Request.Context(), convID); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "conversation not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"ok": true})
}

// ResetAI POST /api/v1/facebook/conversations/:id/reset-ai
func (h *Inbox) ResetAI(c *gin.Context) {
	convID := c.Param("id")
	if err := h.convRepo.ResetTurns(c.Request.Context(), convID); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "conversation not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"ok": true})
}

// SyncConversations POST /api/v1/facebook/sync-conversations
// Pulls latest Messenger threads from Facebook Graph API and upserts into DB.
func (h *Inbox) SyncConversations(c *gin.Context) {
	var req struct {
		PageID string `json:"pageId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	if req.PageID == "" {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", "pageId is required", middleware.GetRequestID(c))
		return
	}
	if err := h.svc.SyncConversations(c.Request.Context(), req.PageID); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "graph API error") || strings.Contains(msg, "graph API HTTP") || strings.Contains(msg, "access token") || strings.Contains(msg, "permission") || strings.Contains(msg, "OAuth") {
			WriteError(c.Writer, c.Request, http.StatusBadRequest, "graph_error", msg, middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", msg, middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"ok": true})
}

// ScanConversations POST /api/v1/facebook/conversations/scan
// Returns open,ai_enabled conversations with unread messages or updated within 24h.
func (h *Inbox) ScanConversations(c *gin.Context) {
	var req struct {
		PageID string `json:"pageId"` // optional; if empty scans all pages (not supported yet)
		Limit  int32  `json:"limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	if req.PageID == "" {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", "pageId is required", middleware.GetRequestID(c))
		return
	}
	if req.Limit <= 0 || req.Limit > 200 {
		req.Limit = 50
	}
	out, err := h.convRepo.ScanConversationsNeedingReply(c.Request.Context(), req.PageID, req.Limit)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}
