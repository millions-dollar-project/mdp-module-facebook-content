package service

import (
	"context"
	"errors"
	"strings"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/db"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Config is the business-logic surface for the singleton config row.
type Config struct {
	repo repo.ConfigRepo
}

// NewConfig builds a Config service.
func NewConfig(r repo.ConfigRepo) *Config { return &Config{repo: r} }

// ErrSecretLeak is returned by the regression test if appSecret ever
// surfaces in a Get response. Kept exported so the test can reference it.
var ErrSecretLeak = errors.New("app_secret must not be returned via API")

// Get returns the public config view. app_secret is intentionally NOT
// included — callers never need it client-side, and the test in
// handlers_test.go asserts it never leaks.
func (s *Config) Get(ctx context.Context) (PublicConfig, error) {
	row, err := s.repo.Get(ctx)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return PublicConfig{}, nil // first boot, no row yet
		}
		return PublicConfig{}, err
	}
	return PublicConfig{
		PageID:                   derefStr(row.PageID),
		PageAccessToken:          row.PageAccessToken,
		PublishMode:              row.PublishMode,
		DefaultPageID:            derefStr(row.DefaultPageID),
		WebhookVerifyToken:       derefStr(row.WebhookVerifyToken),
		AiModel:                  derefStrOrDefault(row.AiModel, "openai"),
		AutoSchedulingEnabled:    derefBool(row.AutoSchedulingEnabled),
		AutoScheduleTimes:        derefStrOrDefault(row.AutoScheduleTimes, "[]"),
		Timezone:                 derefStrOrDefault(row.Timezone, "Asia/Ho_Chi_Minh"),
		DefaultHashtags:          derefStrOrDefault(row.DefaultHashtags, "[]"),
		EnabledContentTones:      derefStrOrDefault(row.EnabledContentTones, "[]"),
		CustomContentTones:       derefStrOrDefault(row.CustomContentTones, "[]"),
		ToneDescriptionOverrides: derefStrOrDefault(row.ToneDescriptionOverrides, "{}"),
		KlingEnabled:             derefBool(row.KlingEnabled),
		KlingPromptTemplate:      derefStr(row.KlingPromptTemplate),
		KlingResolution:          derefStrOrDefault(row.KlingResolution, "2K HD"),
		KlingAspectRatio:         derefStrOrDefault(row.KlingAspectRatio, "3:4"),
		KlingOutputCount:         int(derefInt32OrDefault(row.KlingOutputCount, 1)),
		KlingScheduleDays:        derefStrOrDefault(row.KlingScheduleDays, "[]"),
		KlingReferencePageUrl:    derefStr(row.KlingReferencePageUrl),
		KlingVideoEnabled:        derefBool(row.KlingVideoEnabled),
		KlingVideoPrompts:        derefStrOrDefault(row.KlingVideoPrompts, "[]"),
		KlingVideoAspectRatio:    derefStrOrDefault(row.KlingVideoAspectRatio, "1:1"),
		KlingVideoOutputCount:    int(derefInt32OrDefault(row.KlingVideoOutputCount, 1)),
	}, nil
}

// Save validates and upserts. Empty strings clear fields; the only field
// that cannot be empty is publishMode (must be "auto" or "review").
func (s *Config) Save(ctx context.Context, in PublicConfig) (PublicConfig, error) {
	mode := strings.ToLower(strings.TrimSpace(in.PublishMode))
	if mode != "auto" && mode != "review" {
		return PublicConfig{}, errors.New("publishMode must be 'auto' or 'review'")
	}
	row, err := s.repo.Save(ctx, db.UpsertConfigParams{
		PageID:                   strOrNil(in.PageID),
		PageAccessToken:          strings.TrimSpace(in.PageAccessToken),
		PublishMode:              mode,
		DefaultPageID:            strOrNil(in.DefaultPageID),
		WebhookVerifyToken:       strOrNil(in.WebhookVerifyToken),
		AppSecret:                strings.TrimSpace(in.AppSecret),
		AiModel:                  strOrNil(in.AiModel),
		AutoSchedulingEnabled:    boolPtr(in.AutoSchedulingEnabled),
		AutoScheduleTimes:        strOrNil(in.AutoScheduleTimes),
		Timezone:                 strOrNil(in.Timezone),
		DefaultHashtags:          strOrNil(in.DefaultHashtags),
		EnabledContentTones:      strOrNil(in.EnabledContentTones),
		CustomContentTones:       strOrNil(in.CustomContentTones),
		ToneDescriptionOverrides: strOrNil(in.ToneDescriptionOverrides),
		KlingEnabled:             boolPtr(in.KlingEnabled),
		KlingPromptTemplate:      strOrNil(in.KlingPromptTemplate),
		KlingResolution:          strOrNil(in.KlingResolution),
		KlingAspectRatio:         strOrNil(in.KlingAspectRatio),
		KlingOutputCount:         int32Ptr(in.KlingOutputCount),
		KlingScheduleDays:        strOrNil(in.KlingScheduleDays),
		KlingReferencePageUrl:    strOrNil(in.KlingReferencePageUrl),
		KlingVideoEnabled:        boolPtr(in.KlingVideoEnabled),
		KlingVideoPrompts:        strOrNil(in.KlingVideoPrompts),
		KlingVideoAspectRatio:    strOrNil(in.KlingVideoAspectRatio),
		KlingVideoOutputCount:    int32Ptr(in.KlingVideoOutputCount),
	})
	if err != nil {
		return PublicConfig{}, err
	}
	return PublicConfig{
		PageID:                   derefStr(row.PageID),
		PageAccessToken:          row.PageAccessToken,
		PublishMode:              row.PublishMode,
		DefaultPageID:            derefStr(row.DefaultPageID),
		WebhookVerifyToken:       derefStr(row.WebhookVerifyToken),
		AiModel:                  derefStrOrDefault(row.AiModel, "openai"),
		AutoSchedulingEnabled:    derefBool(row.AutoSchedulingEnabled),
		AutoScheduleTimes:        derefStrOrDefault(row.AutoScheduleTimes, "[]"),
		Timezone:                 derefStrOrDefault(row.Timezone, "Asia/Ho_Chi_Minh"),
		DefaultHashtags:          derefStrOrDefault(row.DefaultHashtags, "[]"),
		EnabledContentTones:      derefStrOrDefault(row.EnabledContentTones, "[]"),
		CustomContentTones:       derefStrOrDefault(row.CustomContentTones, "[]"),
		ToneDescriptionOverrides: derefStrOrDefault(row.ToneDescriptionOverrides, "{}"),
		KlingEnabled:             derefBool(row.KlingEnabled),
		KlingPromptTemplate:      derefStr(row.KlingPromptTemplate),
		KlingResolution:          derefStrOrDefault(row.KlingResolution, "2K HD"),
		KlingAspectRatio:         derefStrOrDefault(row.KlingAspectRatio, "3:4"),
		KlingOutputCount:         int(derefInt32OrDefault(row.KlingOutputCount, 1)),
		KlingScheduleDays:        derefStrOrDefault(row.KlingScheduleDays, "[]"),
		KlingReferencePageUrl:    derefStr(row.KlingReferencePageUrl),
		KlingVideoEnabled:        derefBool(row.KlingVideoEnabled),
		KlingVideoPrompts:        derefStrOrDefault(row.KlingVideoPrompts, "[]"),
		KlingVideoAspectRatio:    derefStrOrDefault(row.KlingVideoAspectRatio, "1:1"),
		KlingVideoOutputCount:    int(derefInt32OrDefault(row.KlingVideoOutputCount, 1)),
	}, nil
}

// PublicConfig is the JSON shape the plugin expects. appSecret is
// accepted on the way in (Save) so users can store it server-side, but
// it never appears on the way out.
type PublicConfig struct {
	PageID                   string `json:"pageId,omitempty"`
	PageAccessToken          string `json:"pageAccessToken,omitempty"`
	PublishMode              string `json:"publishMode"`
	DefaultPageID            string `json:"defaultPageId,omitempty"`
	WebhookVerifyToken       string `json:"webhookVerifyToken,omitempty"`
	AppSecret                string `json:"appSecret,omitempty"` // write-only

	// AI & scheduling
	AiModel                  string `json:"aiModel"`
	AutoSchedulingEnabled    bool   `json:"autoSchedulingEnabled"`
	AutoScheduleTimes        string `json:"autoScheduleTimes"`
	Timezone                 string `json:"timezone"`

	// Content tones / hashtags
	DefaultHashtags          string `json:"defaultHashtags"`
	EnabledContentTones      string `json:"enabledContentTones"`
	CustomContentTones       string `json:"customContentTones"`
	ToneDescriptionOverrides string `json:"toneDescriptionOverrides"`

	// Kling image
	KlingEnabled             bool   `json:"klingEnabled"`
	KlingPromptTemplate      string `json:"klingPromptTemplate,omitempty"`
	KlingResolution          string `json:"klingResolution"`
	KlingAspectRatio         string `json:"klingAspectRatio"`
	KlingOutputCount         int    `json:"klingOutputCount"`
	KlingScheduleDays        string `json:"klingScheduleDays"`
	KlingReferencePageUrl    string `json:"klingReferencePageUrl,omitempty"`

	// Kling video
	KlingVideoEnabled        bool   `json:"klingVideoEnabled"`
	KlingVideoPrompts        string `json:"klingVideoPrompts"`
	KlingVideoAspectRatio    string `json:"klingVideoAspectRatio"`
	KlingVideoOutputCount    int    `json:"klingVideoOutputCount"`
}

func strOrNil(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func derefStrOrDefault(p *string, def string) string {
	if p == nil || *p == "" {
		return def
	}
	return *p
}

func boolPtr(b bool) *bool {
	return &b
}

func derefBool(p *bool) bool {
	if p == nil {
		return false
	}
	return *p
}

func int32Ptr(i int) *int32 {
	v := int32(i)
	return &v
}

func derefInt32OrDefault(p *int32, def int32) int32 {
	if p == nil {
		return def
	}
	return *p
}
