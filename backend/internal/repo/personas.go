package repo

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

// AIPersonasRepo is the contract for AI persona persistence.
type AIPersonasRepo interface {
	List(ctx context.Context) ([]models.AIPersona, error)
	Get(ctx context.Context, id string) (models.AIPersona, error)
	Create(ctx context.Context, in models.AIPersona) (models.AIPersona, error)
	Update(ctx context.Context, in models.AIPersona) (models.AIPersona, error)
	Delete(ctx context.Context, id string) error
	UpdatePagePersona(ctx context.Context, pageID string, personaID *string) error
}

type aiPersonasRepo struct{ q *db.Queries }

// NewAIPersonasRepo wires a Postgres-backed AI personas repo.
func NewAIPersonasRepo(q *db.Queries) AIPersonasRepo { return &aiPersonasRepo{q: q} }

func (r *aiPersonasRepo) List(ctx context.Context) ([]models.AIPersona, error) {
	rows, err := r.q.ListAIPersonas(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]models.AIPersona, 0, len(rows))
	for _, row := range rows {
		out = append(out, aiPersonaFromRow(row))
	}
	return out, nil
}

func (r *aiPersonasRepo) Get(ctx context.Context, id string) (models.AIPersona, error) {
	row, err := r.q.GetAIPersona(ctx, stringToUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.AIPersona{}, ErrNotFound
		}
		return models.AIPersona{}, err
	}
	return aiPersonaFromRow(row), nil
}

func (r *aiPersonasRepo) Create(ctx context.Context, in models.AIPersona) (models.AIPersona, error) {
	row, err := r.q.CreateAIPersona(ctx, db.CreateAIPersonaParams{
		Name:              in.Name,
		Description:       ptrString(in.Description),
		SystemPrompt:        in.SystemPrompt,
		FewShotExamples:     ptrString(in.FewShotExamples),
		PostProcessorType:   in.PostProcessorType,
	})
	if err != nil {
		return models.AIPersona{}, err
	}
	return aiPersonaFromRow(row), nil
}

func (r *aiPersonasRepo) Update(ctx context.Context, in models.AIPersona) (models.AIPersona, error) {
	row, err := r.q.UpdateAIPersona(ctx, db.UpdateAIPersonaParams{
		ID:                stringToUUID(in.ID),
		Name:              in.Name,
		Description:       ptrString(in.Description),
		SystemPrompt:        in.SystemPrompt,
		FewShotExamples:     ptrString(in.FewShotExamples),
		PostProcessorType:   in.PostProcessorType,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.AIPersona{}, ErrNotFound
		}
		return models.AIPersona{}, err
	}
	return aiPersonaFromRow(row), nil
}

func (r *aiPersonasRepo) Delete(ctx context.Context, id string) error {
	return r.q.DeleteAIPersona(ctx, stringToUUID(id))
}

func (r *aiPersonasRepo) UpdatePagePersona(ctx context.Context, pageID string, personaID *string) error {
	var pid pgtype.UUID
	if personaID != nil {
		pid = stringToUUID(*personaID)
	}
	_, err := r.q.UpdatePageAIPersona(ctx, db.UpdatePageAIPersonaParams{
		ID:          stringToUUID(pageID),
		AiPersonaID: pid,
	})
	return err
}

func aiPersonaFromRow(r db.FacebookAiPersona) models.AIPersona {
	return models.AIPersona{
		ID:                uuidToString(r.ID),
		Name:              r.Name,
		Description:       r.Description,
		SystemPrompt:      r.SystemPrompt,
		FewShotExamples:   r.FewShotExamples,
		PostProcessorType: r.PostProcessorType,
		CreatedAt:         pgTimeToTime(r.CreatedAt),
		UpdatedAt:         pgTimeToTime(r.UpdatedAt),
	}
}

func ptrString(s *string) *string {
	return s
}
