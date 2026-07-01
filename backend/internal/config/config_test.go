package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestLoadBrainAIModels — confirms the env-var loader's three
// branches: empty → default, valid JSON → parse, invalid JSON →
// default. Keeping the test in the config package so it can call
// the package-private loadBrainAIModels directly.
func TestLoadBrainAIModels(t *testing.T) {
	t.Run("empty_env_returns_defaults", func(t *testing.T) {
		got := loadBrainAIModels("")
		assert.Equal(t, DefaultAIModels, got)
	})
	t.Run("valid_json_parses", func(t *testing.T) {
		got := loadBrainAIModels(`[{"id":"x","label":"X"},{"id":"y"}]`)
		require.Len(t, got, 2)
		assert.Equal(t, "x", got[0].ID)
		assert.Equal(t, "X", got[0].Label)
		assert.Equal(t, "y", got[1].ID)
		assert.Equal(t, "y", got[1].Label, "missing label should fall back to id")
	})
	t.Run("invalid_json_falls_back_to_defaults", func(t *testing.T) {
		got := loadBrainAIModels("not json {[")
		assert.Equal(t, DefaultAIModels, got)
	})
	t.Run("all_empty_ids_falls_back_to_defaults", func(t *testing.T) {
		got := loadBrainAIModels(`[{"id":"","label":"X"}]`)
		assert.Equal(t, DefaultAIModels, got, "no usable entries → default")
	})
}
