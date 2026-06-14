package service

import (
	"context"
	"strings"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Video manages the singleton video config row.
type Video struct {
	repo repo.VideoRepo
}

func NewVideo(r repo.VideoRepo) *Video { return &Video{repo: r} }

type VideoConfig struct {
	WatermarkType       string `json:"watermarkType"`
	WatermarkText       string `json:"watermarkText,omitempty"`
	WatermarkImagePath  string `json:"watermarkImagePath,omitempty"`
}

func (s *Video) Get(ctx context.Context) (VideoConfig, error) {
	row, err := s.repo.Get(ctx)
	if err != nil {
		return VideoConfig{}, err
	}
	return VideoConfig{
		WatermarkType:      row.WatermarkType,
		WatermarkText:      derefStr(row.WatermarkText),
		WatermarkImagePath: derefStr(row.WatermarkImagePath),
	}, nil
}

func (s *Video) Save(ctx context.Context, in VideoConfig) (VideoConfig, error) {
	wType := strings.TrimSpace(in.WatermarkType)
	if wType == "" {
		wType = "none"
	}
	row, err := s.repo.Save(ctx, db.UpsertVideoConfigParams{
		WatermarkType:      wType,
		WatermarkText:      strOrNil(in.WatermarkText),
		WatermarkImagePath: strOrNil(in.WatermarkImagePath),
	})
	if err != nil {
		return VideoConfig{}, err
	}
	return VideoConfig{
		WatermarkType:      row.WatermarkType,
		WatermarkText:      derefStr(row.WatermarkText),
		WatermarkImagePath: derefStr(row.WatermarkImagePath),
	}, nil
}
