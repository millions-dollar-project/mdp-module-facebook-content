package handlers

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/api/middleware"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/service"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/telemetry"
)

// Webhook is the HTTP adapter for Facebook webhooks.
type Webhook struct {
	svc *service.Webhook
}

// NewWebhook builds the handler.
func NewWebhook(svc *service.Webhook) *Webhook {
	return &Webhook{svc: svc}
}

// VerifyGET handles the Facebook webhook subscription verification.
// Facebook sends GET with hub.mode=subscribe, hub.verify_token, hub.challenge.
func (h *Webhook) VerifyGET(c *gin.Context) {
	mode := c.Query("hub.mode")
	verifyToken := c.Query("hub.verify_token")
	challenge := c.Query("hub.challenge")
	ok, errMsg := h.svc.VerifyChallenge(mode, verifyToken, challenge)
	if !ok {
		c.String(http.StatusForbidden, errMsg)
		return
	}
	c.String(http.StatusOK, challenge)
}

// ReceivePOST handles the Facebook webhook POST delivery.
func (h *Webhook) ReceivePOST(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		WriteError(c.Writer, c.Request, http.StatusBadRequest, "invalid_input", "cannot read body", middleware.GetRequestID(c))
		return
	}
	sig := c.GetHeader("X-Hub-Signature-256")
	if !h.svc.VerifyPayload(body, sig) {
		WriteError(c.Writer, c.Request, http.StatusForbidden, "invalid_signature", "webhook signature mismatch", middleware.GetRequestID(c))
		return
	}
	telemetry.WebhookReceived.WithLabelValues("page").Inc()
	if err := h.svc.ProcessPayload(c.Request.Context(), body, sig); err != nil {
		telemetry.WebhookProcessed.WithLabelValues("page", "error").Inc()
		WriteError(c.Writer, c.Request, http.StatusInternalServerError, "internal", err.Error(), middleware.GetRequestID(c))
		return
	}
	telemetry.WebhookProcessed.WithLabelValues("page", "ok").Inc()
	c.Status(http.StatusOK)
}
