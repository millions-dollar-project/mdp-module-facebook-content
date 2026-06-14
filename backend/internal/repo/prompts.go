package repo

import (
	"context"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
)

type promptsRepo struct{ q *db.Queries }

type PromptsRepo interface {
	List(ctx context.Context, category string) ([]db.FacebookPromptTemplate, error)
	Get(ctx context.Context, id string) (db.FacebookPromptTemplate, error)
	Create(ctx context.Context, in db.CreatePromptTemplateParams) (db.FacebookPromptTemplate, error)
	Update(ctx context.Context, in db.UpdatePromptTemplateParams) (db.FacebookPromptTemplate, error)
	Delete(ctx context.Context, id string) error
}

func NewPromptsRepo(q *db.Queries) PromptsRepo { return &promptsRepo{q: q} }

func (r *promptsRepo) List(ctx context.Context, category string) ([]db.FacebookPromptTemplate, error) {
	return r.q.ListPromptTemplates(ctx, category)
}
func (r *promptsRepo) Get(ctx context.Context, id string) (db.FacebookPromptTemplate, error) {
	return r.q.GetPromptTemplate(ctx, id)
}
func (r *promptsRepo) Create(ctx context.Context, in db.CreatePromptTemplateParams) (db.FacebookPromptTemplate, error) {
	return r.q.CreatePromptTemplate(ctx, in)
}
func (r *promptsRepo) Update(ctx context.Context, in db.UpdatePromptTemplateParams) (db.FacebookPromptTemplate, error) {
	return r.q.UpdatePromptTemplate(ctx, in)
}
func (r *promptsRepo) Delete(ctx context.Context, id string) error {
	return r.q.DeletePromptTemplate(ctx, id)
}
