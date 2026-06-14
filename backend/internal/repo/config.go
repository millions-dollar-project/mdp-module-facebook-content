package repo

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/secure"
)

// configRepo holds the singleton config row. The service layer treats
// config as a value object — there's no "Create" or "Delete" in the
// public surface, only Get and Save (which acts as upsert).
type configRepo struct {
	q   *db.Queries
	box *secure.Box
}

// ConfigRepo is the public contract.
type ConfigRepo interface {
	Get(ctx context.Context) (db.GetConfigRow, error)
	Save(ctx context.Context, in db.UpsertConfigParams) (db.UpsertConfigRow, error)
}

// NewConfigRepo wires a ConfigRepo backed by sqlc.
func NewConfigRepo(q *db.Queries, box *secure.Box) ConfigRepo {
	if box == nil {
		box = &secure.Box{}
	}
	return &configRepo{q: q, box: box}
}

func (r *configRepo) Get(ctx context.Context) (db.GetConfigRow, error) {
	row, err := r.q.GetConfig(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.GetConfigRow{}, ErrNotFound
		}
		return db.GetConfigRow{}, err
	}
	row.PageAccessToken, _ = r.box.Decrypt(row.PageAccessToken)
	if row.AppSecret != "" {
		row.AppSecret, _ = r.box.Decrypt(row.AppSecret)
	}
	return row, nil
}

func (r *configRepo) Save(ctx context.Context, in db.UpsertConfigParams) (db.UpsertConfigRow, error) {
	in.PageAccessToken = r.box.Encrypt(in.PageAccessToken)
	if in.AppSecret != "" {
		in.AppSecret = r.box.Encrypt(in.AppSecret)
	}
	row, err := r.q.UpsertConfig(ctx, in)
	if err != nil {
		return db.UpsertConfigRow{}, err
	}
	row.PageAccessToken, _ = r.box.Decrypt(row.PageAccessToken)
	if row.AppSecret != "" {
		row.AppSecret, _ = r.box.Decrypt(row.AppSecret)
	}
	return row, nil
}
