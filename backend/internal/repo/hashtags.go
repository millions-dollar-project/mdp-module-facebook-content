package repo

import (
	"context"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
)

type hashtagsRepo struct{ q *db.Queries }

type HashtagsRepo interface {
	List(ctx context.Context) ([]db.FacebookHashtagBank, error)
	Add(ctx context.Context, in db.AddHashtagParams) (db.FacebookHashtagBank, error)
	Delete(ctx context.Context, tag string) error
}

func NewHashtagsRepo(q *db.Queries) HashtagsRepo { return &hashtagsRepo{q: q} }

func (r *hashtagsRepo) List(ctx context.Context) ([]db.FacebookHashtagBank, error) {
	return r.q.ListHashtags(ctx)
}
func (r *hashtagsRepo) Add(ctx context.Context, in db.AddHashtagParams) (db.FacebookHashtagBank, error) {
	return r.q.AddHashtag(ctx, in)
}
func (r *hashtagsRepo) Delete(ctx context.Context, tag string) error {
	return r.q.DeleteHashtag(ctx, tag)
}
