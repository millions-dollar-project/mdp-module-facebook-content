package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/config"
)

// BrainAIModelsResponse is the wire shape of GET /brain/ai-models.
// The plugin uses this to populate the "AI model" dropdown in the
// SchedulePostModal. Each entry is {id, label} where id is what we
// pass to the AI provider and label is the human-friendly name.
type BrainAIModelsResponse struct {
	Data []config.AIModel `json:"data"`
}

// BrainAIModelsHandler owns GET /brain/ai-models. The list is
// static for the lifetime of the process (loaded from config at
// boot) so we don't need a DB lookup or any async work here.
type BrainAIModelsHandler struct {
	models []config.AIModel
}

// NewBrainAIModelsHandler takes a defensive copy of the model list
// so the caller can mutate their Config without affecting us.
func NewBrainAIModelsHandler(models []config.AIModel) *BrainAIModelsHandler {
	out := make([]config.AIModel, len(models))
	copy(out, models)
	return &BrainAIModelsHandler{models: out}
}

// List godoc
// @Summary List AI models available to the brain draft generator
// @Description Returns the configured list of AI models the user can
// @Description pick in the "Tạo bài từ crawl" modal. Static for the
// @Description process lifetime; configured via MDP_BRAIN_AI_MODELS.
// @Tags brain
func (h *BrainAIModelsHandler) List(c *gin.Context) {
	if len(h.models) == 0 {
		// 503 instead of 200+empty so the UI shows a clear "no
		// models configured" error instead of a blank dropdown.
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"code":    "no_ai_models",
			"message": "no AI models configured; set MDP_BRAIN_AI_MODELS",
		})
		return
	}
	c.JSON(http.StatusOK, BrainAIModelsResponse{Data: h.models})
}
