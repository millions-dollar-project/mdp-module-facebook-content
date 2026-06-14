package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
)

// Comments is the HTTP adapter for comment monitoring.
type Comments struct {
	commentsRepo repo.CommentsRepo
	pagesRepo    repo.PagesRepo
	graph        *fb.Client
	monitor      *service.CommentMonitor
}

// NewComments builds the handler.
func NewComments(cr repo.CommentsRepo, pr repo.PagesRepo, graph *fb.Client, monitor *service.CommentMonitor) *Comments {
	return &Comments{commentsRepo: cr, pagesRepo: pr, graph: graph, monitor: monitor}
}

// ListComments GET /api/v1/facebook/comments?pageId=...
func (h *Comments) ListComments(c *gin.Context) {
	pageID := c.Query("pageId")
	if pageID == "" {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", "pageId is required", middleware.GetRequestID(c))
		return
	}
	out, err := h.commentsRepo.ListByPage(c.Request.Context(), pageID, 100)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"data": out})
}

// ProcessComments POST /api/v1/facebook/comments/process?pageId=...
func (h *Comments) ProcessComments(c *gin.Context) {
	pageID := c.Query("pageId")
	if pageID == "" {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", "pageId is required", middleware.GetRequestID(c))
		return
	}
	if err := h.monitor.ProcessPageComments(c.Request.Context(), pageID); err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"ok": true})
}

// replyCommentReq is the body for POST /comments/:id/reply.
type replyCommentReq struct {
	Text string `json:"text"`
}

// ReplyComment POST /api/v1/facebook/comments/:id/reply
func (h *Comments) ReplyComment(c *gin.Context) {
	var req replyCommentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	commentID := c.Param("id")
	ctx := c.Request.Context()
	comment, err := h.commentsRepo.Get(ctx, commentID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "comment not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	page, err := h.pagesRepo.GetByFBID(ctx, comment.PageID)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", fmt.Sprintf("resolve page: %v", err), middleware.GetRequestID(c))
		return
	}
	fbReplyID, err := h.graph.ReplyToComment(ctx, commentID, req.Text, page.PageAccessToken)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadGateway, "graph_error", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = h.commentsRepo.InsertReply(ctx, models.CommentReply{
		CommentID:       commentID,
		ReplyType:       "public",
		Content:         req.Text,
		SentBy:          "AI",
		Status:          "sent",
		FacebookReplyID: &fbReplyID,
		SentAt:          time.Now(),
	})
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"facebookReplyId": fbReplyID})
}

// PrivateReply POST /api/v1/facebook/comments/:id/private-reply
func (h *Comments) PrivateReply(c *gin.Context) {
	var req replyCommentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", err.Error(), middleware.GetRequestID(c))
		return
	}
	commentID := c.Param("id")
	ctx := c.Request.Context()
	comment, err := h.commentsRepo.Get(ctx, commentID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "comment not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	page, err := h.pagesRepo.GetByFBID(ctx, comment.PageID)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", fmt.Sprintf("resolve page: %v", err), middleware.GetRequestID(c))
		return
	}
	pmID, err := h.graph.SendPrivateReply(ctx, commentID, req.Text, page.PageAccessToken)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadGateway, "graph_error", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = h.commentsRepo.UpdatePrivateReply(ctx, commentID, true)
	_ = h.commentsRepo.InsertReply(ctx, models.CommentReply{
		CommentID:       commentID,
		ReplyType:       "private",
		Content:         req.Text,
		SentBy:          "AI",
		Status:          "sent",
		FacebookReplyID: &pmID,
		SentAt:          time.Now(),
	})
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"facebookReplyId": pmID})
}

// LikeComment POST /api/v1/facebook/comments/:id/like
func (h *Comments) LikeComment(c *gin.Context) {
	commentID := c.Param("id")
	if err := h.commentsRepo.UpdateLiked(c.Request.Context(), commentID, true); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(c.Writer, c.Request, http.StatusNotFound, "not_found", "comment not found", middleware.GetRequestID(c))
			return
		}
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	_ = WriteJSON(c.Writer, http.StatusOK, gin.H{"ok": true})
}
