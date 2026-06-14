package repo

import (
	"context"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
)

type videoRepo struct{ q *db.Queries }

type VideoRepo interface {
	Get(ctx context.Context) (db.FacebookVideoConfig, error)
	Save(ctx context.Context, in db.UpsertVideoConfigParams) (db.FacebookVideoConfig, error)
}

func NewVideoRepo(q *db.Queries) VideoRepo { return &videoRepo{q: q} }

func (r *videoRepo) Get(ctx context.Context) (db.FacebookVideoConfig, error) {
	return r.q.GetVideoConfig(ctx)
}
func (r *videoRepo) Save(ctx context.Context, in db.UpsertVideoConfigParams) (db.FacebookVideoConfig, error) {
	return r.q.UpsertVideoConfig(ctx, in)
}
