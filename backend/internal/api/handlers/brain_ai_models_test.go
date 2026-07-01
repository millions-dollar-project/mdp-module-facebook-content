package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/config"
)

func setupAIModelsRouter(h *BrainAIModelsHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/v1/facebook/brain/ai-models", h.List)
	return r
}

// TestBrainAIModelsHandler_DefaultList — when the handler is wired
// with config.DefaultAIModels, GET /brain/ai-models returns that
// list. Every entry has a non-empty id (used as the AI provider
// key on submit) and label (shown in the dropdown).
func TestBrainAIModelsHandler_DefaultList(t *testing.T) {
	h := NewBrainAIModelsHandler(config.DefaultAIModels)
	r := setupAIModelsRouter(h)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/facebook/brain/ai-models", nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var resp BrainAIModelsResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp.Data, len(config.DefaultAIModels))
	for _, m := range resp.Data {
		assert.NotEmpty(t, m.ID, "every model needs an id (used as the AI provider key)")
		assert.NotEmpty(t, m.Label, "every model needs a label (shown in the dropdown)")
	}
}

// TestBrainAIModelsHandler_OverrideList — when ops passes a custom
// list (via MDP_BRAIN_AI_MODELS), that exact list is exposed.
func TestBrainAIModelsHandler_OverrideList(t *testing.T) {
	custom := []config.AIModel{
		{ID: "internal-gpt-4o", Label: "Internal GPT-4o"},
		{ID: "internal-claude", Label: "Internal Claude"},
	}
	h := NewBrainAIModelsHandler(custom)
	r := setupAIModelsRouter(h)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/facebook/brain/ai-models", nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var resp BrainAIModelsResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	require.Len(t, resp.Data, 2)
	assert.Equal(t, "internal-gpt-4o", resp.Data[0].ID)
	assert.Equal(t, "Internal GPT-4o", resp.Data[0].Label)
	assert.Equal(t, "internal-claude", resp.Data[1].ID)
}

// TestBrainAIModelsHandler_EmptyList_503 — if the handler is wired
// with a nil/empty list, return 503 (not 200 with empty data —
// that would render as a blank dropdown and the user would have
// no way to recover).
func TestBrainAIModelsHandler_EmptyList_503(t *testing.T) {
	h := NewBrainAIModelsHandler(nil)
	r := setupAIModelsRouter(h)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/facebook/brain/ai-models", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Contains(t, w.Body.String(), "no_ai_models")
}

// TestBrainAIModelsHandler_DefensiveCopy — mutating the caller's
// slice after construction MUST NOT affect the handler's view. This
// is the only thing standing between us and a confusing bug where
// the AI dropdown silently changes after a config save.
func TestBrainAIModelsHandler_DefensiveCopy(t *testing.T) {
	original := []config.AIModel{
		{ID: "a", Label: "A"},
		{ID: "b", Label: "B"},
	}
	h := NewBrainAIModelsHandler(original)

	// Mutate the caller's slice.
	original[0].Label = "MUTATED"
	original = append(original, config.AIModel{ID: "c", Label: "C"})

	// Handler should still see the pre-mutation state.
	assert.Len(t, h.models, 2)
	assert.Equal(t, "A", h.models[0].Label)
	assert.Equal(t, "B", h.models[1].Label)
}
