package service

import (
	"context"
	"errors"
	"strings"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Hashtags manages the global hashtag pool.
type Hashtags struct {
	repo repo.HashtagsRepo
}

func NewHashtags(r repo.HashtagsRepo) *Hashtags { return &Hashtags{repo: r} }

type HashtagEntry struct {
	Tag      string `json:"tag"`
	Category string `json:"category,omitempty"`
}

func (s *Hashtags) List(ctx context.Context) ([]HashtagEntry, error) {
	rows, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]HashtagEntry, len(rows))
	for i, r := range rows {
		out[i] = HashtagEntry{Tag: r.Tag, Category: derefStr(r.Category)}
	}
	return out, nil
}

func (s *Hashtags) Add(ctx context.Context, tag, category string) (HashtagEntry, error) {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return HashtagEntry{}, errors.New("tag is required")
	}
	if !strings.HasPrefix(tag, "#") {
		tag = "#" + tag
	}
	row, err := s.repo.Add(ctx, db.AddHashtagParams{Tag: tag, Category: strOrNil(category)})
	if err != nil {
		return HashtagEntry{}, err
	}
	return HashtagEntry{Tag: row.Tag, Category: derefStr(row.Category)}, nil
}

func (s *Hashtags) Delete(ctx context.Context, tag string) error {
	return s.repo.Delete(ctx, tag)
}
