package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Prompts manages the AI prompt template library.
type Prompts struct {
	repo repo.PromptsRepo
}

func NewPrompts(r repo.PromptsRepo) *Prompts { return &Prompts{repo: r} }

type PromptTemplate struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Category        string    `json:"category"`
	PromptText      string    `json:"promptText"`
	VariablesJson   string    `json:"variablesJson"`
	Description     string    `json:"description"`
	IsActive        bool      `json:"isActive"`
	SupportedTones string    `json:"supportedTones"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func rowToTemplate(row db.FacebookPromptTemplate) PromptTemplate {
	return PromptTemplate{
		ID:              row.ID,
		Name:            row.Name,
		Category:        row.Category,
		PromptText:      row.PromptText,
		VariablesJson:   row.VariablesJson,
		Description:     derefStr(row.Description),
		IsActive:        row.IsActive,
		SupportedTones:  row.SupportedTones,
		CreatedAt:       row.CreatedAt.Time,
		UpdatedAt:       row.UpdatedAt.Time,
	}
}

func (s *Prompts) List(ctx context.Context, category string) ([]PromptTemplate, error) {
	rows, err := s.repo.List(ctx, category)
	if err != nil {
		return nil, err
	}
	out := make([]PromptTemplate, len(rows))
	for i, r := range rows {
		out[i] = rowToTemplate(r)
	}
	return out, nil
}

func (s *Prompts) Get(ctx context.Context, id string) (PromptTemplate, error) {
	row, err := s.repo.Get(ctx, id)
	if err != nil {
		return PromptTemplate{}, err
	}
	return rowToTemplate(row), nil
}

func (s *Prompts) Create(ctx context.Context, in PromptTemplate) (PromptTemplate, error) {
	if strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.PromptText) == "" {
		return PromptTemplate{}, errors.New("name and promptText are required")
	}
	if in.ID == "" {
		in.ID = uuid.NewString()
	}
	if in.Category == "" {
		in.Category = "campaign_content"
	}
	if in.VariablesJson == "" {
		in.VariablesJson = "[]"
	}
	if in.SupportedTones == "" {
		in.SupportedTones = "[]"
	}
	row, err := s.repo.Create(ctx, db.CreatePromptTemplateParams{
		ID:              in.ID,
		Name:            in.Name,
		Category:        in.Category,
		PromptText:      in.PromptText,
		VariablesJson:   in.VariablesJson,
		Description:     strOrNil(in.Description),
		IsActive:        in.IsActive,
		SupportedTones:  in.SupportedTones,
	})
	if err != nil {
		return PromptTemplate{}, err
	}
	return rowToTemplate(row), nil
}

func (s *Prompts) Update(ctx context.Context, id string, in PromptTemplate) (PromptTemplate, error) {
	if strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.PromptText) == "" {
		return PromptTemplate{}, errors.New("name and promptText are required")
	}
	row, err := s.repo.Update(ctx, db.UpdatePromptTemplateParams{
		ID:              id,
		Name:            in.Name,
		Category:        in.Category,
		PromptText:      in.PromptText,
		VariablesJson:   in.VariablesJson,
		Description:     strOrNil(in.Description),
		IsActive:        in.IsActive,
		SupportedTones:  in.SupportedTones,
	})
	if err != nil {
		return PromptTemplate{}, err
	}
	return rowToTemplate(row), nil
}

func (s *Prompts) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
