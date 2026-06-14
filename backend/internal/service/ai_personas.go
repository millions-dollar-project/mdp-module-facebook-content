package service

import (
	"context"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// AIPersonas is the business-logic surface for AI persona management.
type AIPersonas struct {
	repo repo.AIPersonasRepo
}

// NewAIPersonas builds the service.
func NewAIPersonas(r repo.AIPersonasRepo) *AIPersonas {
	return &AIPersonas{repo: r}
}

// List returns all personas.
func (s *AIPersonas) List(ctx context.Context) ([]models.AIPersona, error) {
	return s.repo.List(ctx)
}

// Create inserts a new persona.
func (s *AIPersonas) Create(ctx context.Context, in models.AIPersona) (models.AIPersona, error) {
	return s.repo.Create(ctx, in)
}

// Update replaces a persona.
func (s *AIPersonas) Update(ctx context.Context, in models.AIPersona) (models.AIPersona, error) {
	return s.repo.Update(ctx, in)
}

// Delete removes a persona.
func (s *AIPersonas) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
