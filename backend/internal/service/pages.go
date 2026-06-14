package service

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// ErrDuplicate is returned by Add when the Facebook page id is already
// registered. Callers (HTTP handlers) map this to 409 Conflict. The
// underlying repo.ErrDuplicate is preserved for repository-level use.
var ErrDuplicate = errors.New("page already exists")

// Pages is the business-logic surface for the Pages resource.
type Pages struct {
	repo  repo.PagesRepo
	graph *fb.Client
	log   *slog.Logger
}

// NewPages builds a Pages service.
func NewPages(r repo.PagesRepo, g *fb.Client, log *slog.Logger) *Pages {
	return &Pages{repo: r, graph: g, log: log}
}

// List returns all managed pages.
func (s *Pages) List(ctx context.Context) ([]models.Page, error) {
	return s.repo.List(ctx)
}

// Add validates and inserts a new page. Returns the inserted row or an
// error whose message is safe to surface to the user.
func (s *Pages) Add(ctx context.Context, in models.Page) (models.Page, error) {
	if strings.TrimSpace(in.PageID) == "" {
		return models.Page{}, errors.New("pageId is required")
	}
	if strings.TrimSpace(in.PageAccessToken) == "" {
		return models.Page{}, errors.New("pageAccessToken is required")
	}
	// If pageName is empty, auto-resolve via Graph API so the plugin
	// only needs to send pageId + pageAccessToken (same UX as SCA).
	// If the token is invalid or the page doesn't exist on Graph API yet,
	// fall back to the pageId as a temporary name so the row can still
	// be created — the user can edit the name later.
	if strings.TrimSpace(in.PageName) == "" {
		if s.graph != nil {
			info, err := s.graph.GetPageInfo(ctx, in.PageID, in.PageAccessToken)
			if err == nil && info.Name != "" {
				in.PageName = info.Name
			}
		}
		if strings.TrimSpace(in.PageName) == "" {
			in.PageName = in.PageID
		}
	}
	// De-dupe by Facebook page ID — clearer error than a UNIQUE violation.
	if _, err := s.repo.GetByFBID(ctx, in.PageID); err == nil {
		return models.Page{}, ErrDuplicate
	} else if !errors.Is(err, repo.ErrNotFound) {
		return models.Page{}, err
	}
	out, err := s.repo.Create(ctx, in)
	if err != nil {
		// Race: a parallel request inserted the same page_id between our
		// check and our insert. Surface the same conflict the check path
		// would have produced.
		if errors.Is(err, repo.ErrDuplicate) {
			return models.Page{}, ErrDuplicate
		}
		return models.Page{}, err
	}
	return out, nil
}

// Update replaces the editable fields. id is required.
func (s *Pages) Update(ctx context.Context, in models.Page) (models.Page, error) {
	if in.ID == "" {
		return models.Page{}, errors.New("id is required")
	}
	if strings.TrimSpace(in.PageName) == "" {
		return models.Page{}, errors.New("pageName is required")
	}
	return s.repo.Update(ctx, in)
}

// Delete removes a page by id.
func (s *Pages) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}

// GetByFBID resolves a Facebook page id to the local row, exposing the
// repo lookup through the service so handlers don't need a second dep.
func (s *Pages) GetByFBID(ctx context.Context, pageID string) (models.Page, error) {
	return s.repo.GetByFBID(ctx, pageID)
}

// TogglePosting flips the posting_enabled flag. id is the local row
// UUID. Callers that hold only the Facebook page id must resolve it via
// GetByFBID first (the handler does this).
func (s *Pages) TogglePosting(ctx context.Context, id string, enabled bool) (models.Page, error) {
	return s.repo.TogglePosting(ctx, id, enabled)
}

// ToggleAI flips the ai_enabled flag.
func (s *Pages) ToggleAI(ctx context.Context, id string, enabled bool) (models.Page, error) {
	return s.repo.ToggleAI(ctx, id, enabled)
}

// UpdatePersona updates only the AI persona fields for a page.
func (s *Pages) UpdatePersona(ctx context.Context, id string, p models.PageInlinePersona) (models.Page, error) {
	return s.repo.UpdatePersona(ctx, id, p)
}

func (s *Pages) SetPageAIPersona(ctx context.Context, id string, personaID *string) (models.Page, error) {
	return s.repo.SetPageAIPersona(ctx, id, personaID)
}

// TestConnection calls the Graph API to verify the page token works. If
// the token has expired or the page was deleted, returns Status="fail"
// with a useful message rather than a 5xx. (The handler maps that to 200
// with the result body, not 500 — the plugin renders a green/red pill.)
func (s *Pages) TestConnection(ctx context.Context, pageID string) (models.PageTestResult, error) {
	page, err := s.repo.GetByFBID(ctx, pageID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return models.PageTestResult{Status: "fail", Message: "page not registered"}, nil
		}
		return models.PageTestResult{}, err
	}
	info, err := s.graph.GetPageInfo(ctx, page.PageID, page.PageAccessToken)
	if err != nil {
		s.log.Warn("graph API test-connection failed", "pageID", pageID, "err", err)
		return models.PageTestResult{Status: "fail", Message: err.Error()}, nil
	}
	// Update last_active_at on success — non-fatal if it fails.
	if uerr := s.touchLastActive(ctx, page.ID); uerr != nil {
		s.log.Debug("touch last_active_at failed", "err", uerr)
	}
	return models.PageTestResult{
		Status:         "ok",
		PageName:       info.Name,
		FollowersCount: info.FanCount,
	}, nil
}

func (s *Pages) touchLastActive(ctx context.Context, id string) error {
	page, err := s.repo.Get(ctx, id)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	page.LastActiveAt = &now
	_, err = s.repo.Update(ctx, page)
	return err
}
