// Package models holds the domain types exposed to handlers.
package models

import "time"

// AIPersona is a reusable AI persona that one or many pages can reference.
type AIPersona struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	Description       *string   `json:"description,omitempty"`
	SystemPrompt      string    `json:"systemPrompt"`
	FewShotExamples   *string   `json:"fewShotExamples,omitempty"`
	PostProcessorType string    `json:"postProcessorType"` // generic | ecohome
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}
