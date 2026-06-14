// Package repo holds the data-access layer. Repos accept and return
// domain models (internal/models) so the service and handler layers
// never need to know about sqlc row structs.
package repo

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/secure"
)

// ErrNotFound is returned when a row was expected but not present. The
// service layer maps this to HTTP 404.
var ErrNotFound = errors.New("not found")

// pagesRepo is the postgres-backed implementation. It is unexported —
// the public PagesRepo interface lives in this file too, which is what
// callers (service, tests) depend on.
type pagesRepo struct {
	q   *db.Queries
	box *secure.Box
}

// PagesRepo is the contract the service layer depends on. Tests can
// substitute a mock.
type PagesRepo interface {
	List(ctx context.Context) ([]models.Page, error)
	Get(ctx context.Context, id string) (models.Page, error)
	GetByFBID(ctx context.Context, pageID string) (models.Page, error)
	Create(ctx context.Context, in models.Page) (models.Page, error)
	Update(ctx context.Context, in models.Page) (models.Page, error)
	UpdatePersona(ctx context.Context, id string, p models.PageInlinePersona) (models.Page, error)
	SetPageAIPersona(ctx context.Context, id string, personaID *string) (models.Page, error)
	Delete(ctx context.Context, id string) error
	TogglePosting(ctx context.Context, id string, enabled bool) (models.Page, error)
	ToggleAI(ctx context.Context, id string, enabled bool) (models.Page, error)
}

// NewPagesRepo wires a PagesRepo backed by sqlc-generated queries.
func NewPagesRepo(q *db.Queries, box *secure.Box) PagesRepo {
	if box == nil {
		box = &secure.Box{}
	}
	return &pagesRepo{q: q, box: box}
}

func (r *pagesRepo) List(ctx context.Context) ([]models.Page, error) {
	rows, err := r.q.ListPages(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]models.Page, 0, len(rows))
	for _, row := range rows {
		out = append(out, r.pageFromRow(row))
	}
	return out, nil
}

func (r *pagesRepo) Get(ctx context.Context, id string) (models.Page, error) {
	row, err := r.q.GetPage(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Page{}, ErrNotFound
		}
		return models.Page{}, err
	}
	return r.pageFromRow(row), nil
}

func (r *pagesRepo) GetByFBID(ctx context.Context, pageID string) (models.Page, error) {
	row, err := r.q.GetPageByFBID(ctx, pageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Page{}, ErrNotFound
		}
		return models.Page{}, err
	}
	return r.pageFromRow(row), nil
}

func (r *pagesRepo) Create(ctx context.Context, in models.Page) (models.Page, error) {
	var pid pgtype.UUID
	if in.AIPersonaID != nil {
		pid = stringToUUID(*in.AIPersonaID)
	}
	row, err := r.q.CreatePage(ctx, db.CreatePageParams{
		PageID:           in.PageID,
		PageName:         in.PageName,
		PageAccessToken:  r.box.Encrypt(in.PageAccessToken),
		Category:         in.Category,
		IsActive:         in.IsActive,
		PostingEnabled:   in.PostingEnabled,
		AiEnabled:        in.AIEnabled,
		AvatarUrl:        in.AvatarURL,
		AiRole:           in.AIRole,
		AiIndustry:       in.AIIndustry,
		AiTone:           in.AITone,
		AiPriceList:      in.AIPriceList,
		AiLocationInfo:   in.AILocationInfo,
		AiContactChannel: in.AIContactChannel,
		AiExtraRules:     in.AIExtraRules,
		AiSystemPrompt:   in.AISystemPrompt,
		AiPersonaID:      pid,
	})
	if err != nil {
		return models.Page{}, mapUniqueViolation(err)
	}
	return r.pageFromRow(row), nil
}

func (r *pagesRepo) Update(ctx context.Context, in models.Page) (models.Page, error) {
	var pid pgtype.UUID
	if in.AIPersonaID != nil {
		pid = stringToUUID(*in.AIPersonaID)
	}
	row, err := r.q.UpdatePage(ctx, db.UpdatePageParams{
		ID:               stringToUUID(in.ID),
		PageName:         in.PageName,
		PageAccessToken:  r.box.Encrypt(in.PageAccessToken),
		Category:         in.Category,
		IsActive:         in.IsActive,
		PostingEnabled:   in.PostingEnabled,
		AiEnabled:        in.AIEnabled,
		AvatarUrl:        in.AvatarURL,
		AiRole:           in.AIRole,
		AiIndustry:       in.AIIndustry,
		AiTone:           in.AITone,
		AiPriceList:      in.AIPriceList,
		AiLocationInfo:   in.AILocationInfo,
		AiContactChannel: in.AIContactChannel,
		AiExtraRules:     in.AIExtraRules,
		AiSystemPrompt:   in.AISystemPrompt,
		AiPersonaID:      pid,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Page{}, ErrNotFound
		}
		return models.Page{}, mapUniqueViolation(err)
	}
	return r.pageFromRow(row), nil
}

func (r *pagesRepo) UpdatePersona(ctx context.Context, id string, p models.PageInlinePersona) (models.Page, error) {
	row, err := r.q.UpdatePagePersona(ctx, db.UpdatePagePersonaParams{
		ID:               stringToUUID(id),
		AiRole:           p.Role,
		AiIndustry:       p.Industry,
		AiTone:           p.Tone,
		AiPriceList:      p.PriceList,
		AiLocationInfo:   p.LocationInfo,
		AiContactChannel: p.ContactChannel,
		AiExtraRules:     p.ExtraRules,
		AiSystemPrompt:   p.SystemPrompt,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Page{}, ErrNotFound
		}
		return models.Page{}, err
	}
	return r.pageFromRow(row), nil
}

func (r *pagesRepo) SetPageAIPersona(ctx context.Context, id string, personaID *string) (models.Page, error) {
	var pid pgtype.UUID
	if personaID != nil {
		pid = stringToUUID(*personaID)
	}
	row, err := r.q.UpdatePageAIPersona(ctx, db.UpdatePageAIPersonaParams{
		ID:          stringToUUID(id),
		AiPersonaID: pid,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Page{}, ErrNotFound
		}
		return models.Page{}, err
	}
	return r.pageFromRow(row), nil
}

func (r *pagesRepo) Delete(ctx context.Context, id string) error {
	if err := r.q.DeletePage(ctx, stringToUUID(id)); err != nil {
		return err
	}
	return nil
}

func (r *pagesRepo) TogglePosting(ctx context.Context, id string, enabled bool) (models.Page, error) {
	row, err := r.q.TogglePagePosting(ctx, db.TogglePagePostingParams{
		ID:             stringToUUID(id),
		PostingEnabled: enabled,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Page{}, ErrNotFound
		}
		return models.Page{}, err
	}
	return r.pageFromRow(row), nil
}

func (r *pagesRepo) ToggleAI(ctx context.Context, id string, enabled bool) (models.Page, error) {
	row, err := r.q.TogglePageAI(ctx, db.TogglePageAIParams{
		ID:        stringToUUID(id),
		AiEnabled: enabled,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Page{}, ErrNotFound
		}
		return models.Page{}, err
	}
	return r.pageFromRow(row), nil
}

// pageFromRow converts a sqlc row into the domain model. Field mapping
// keeps DB column names (snake_case) in the db.* struct, public fields
// in camelCase in models.Page.
func (r *pagesRepo) pageFromRow(row db.FacebookPage) models.Page {
	last := pgTimeToTime(row.LastActiveAt)
	var lastPtr *time.Time
	if !last.IsZero() {
		lastPtr = &last
	}
	tok, _ := r.box.Decrypt(row.PageAccessToken)
	return models.Page{
		ID:               uuidToString(row.ID),
		PageID:           row.PageID,
		PageName:         row.PageName,
		PageAccessToken:  tok,
		Category:         row.Category,
		IsActive:         row.IsActive,
		PostingEnabled:   row.PostingEnabled,
		AIEnabled:        row.AiEnabled,
		LastActiveAt:     lastPtr,
		AvatarURL:        row.AvatarUrl,
		CreatedAt:        pgTimeToTime(row.CreatedAt),
		UpdatedAt:        pgTimeToTime(row.UpdatedAt),
		AIRole:           row.AiRole,
		AIIndustry:       row.AiIndustry,
		AITone:           row.AiTone,
		AIPriceList:      row.AiPriceList,
		AILocationInfo:   row.AiLocationInfo,
		AIContactChannel: row.AiContactChannel,
		AIExtraRules:     row.AiExtraRules,
		AISystemPrompt:   row.AiSystemPrompt,
		AIPersonaID:      uuidPtr(row.AiPersonaID),
	}
}

func uuidPtr(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuidToString(u)
	return &s
}

// mapUniqueViolation converts Postgres 23505 (unique_violation) into
// ErrDuplicate so callers can return HTTP 409 cleanly.
func mapUniqueViolation(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrDuplicate
	}
	return err
}
