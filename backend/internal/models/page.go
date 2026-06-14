// Package models holds the domain types exposed to handlers. These types
// are deliberately decoupled from sqlc-generated row structs (db.*) and
// from JSON DTOs in handlers — they represent the "stable" shape of
// each resource inside the service.
package models

import "time"

// Page mirrors a managed Facebook page. The JSON contract sent to the
// plugin (see plugin/src/lib/types.ts `FacebookPage`) uses camelCase
// field names; the conversion happens in the handler layer.
type Page struct {
	ID              string     `json:"id"`
	PageID          string     `json:"pageId"`
	PageName        string     `json:"pageName"`
	PageAccessToken string     `json:"pageAccessToken,omitempty"`
	Category        *string    `json:"category,omitempty"`
	IsActive        bool       `json:"isActive"`
	PostingEnabled  bool       `json:"postingEnabled"`
	AIEnabled       bool       `json:"aiEnabled"`
	LastActiveAt    *time.Time `json:"lastActiveAt,omitempty"`
	AvatarURL       *string    `json:"avatarUrl,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
	// AI persona per page — allows different verticals (mầm non, xây dựng, spa, …)
	AIRole           *string `json:"aiRole,omitempty"`
	AIIndustry       *string `json:"aiIndustry,omitempty"`
	AITone           *string `json:"aiTone,omitempty"`
	AIPriceList      *string `json:"aiPriceList,omitempty"`
	AILocationInfo   *string `json:"aiLocationInfo,omitempty"`
	AIContactChannel *string `json:"aiContactChannel,omitempty"`
	AIExtraRules     *string `json:"aiExtraRules,omitempty"`
	AISystemPrompt   *string `json:"aiSystemPrompt,omitempty"`
	AIPersonaID      *string `json:"aiPersonaId,omitempty"` // shared persona reference
}

// PageInlinePersona holds the legacy per-page AI settings that are stored
// directly on the page row (not shared via ai_personas).
type PageInlinePersona struct {
	Role           *string `json:"role,omitempty"`
	Industry       *string `json:"industry,omitempty"`
	Tone           *string `json:"tone,omitempty"`
	PriceList      *string `json:"priceList,omitempty"`
	LocationInfo   *string `json:"locationInfo,omitempty"`
	ContactChannel *string `json:"contactChannel,omitempty"`
	ExtraRules     *string `json:"extraRules,omitempty"`
	SystemPrompt   *string `json:"systemPrompt,omitempty"`
}

// PageTestResult is the response from `test-page-connection`.
// `Status = "ok"` | "fail". The plugin uses this to render a green/red
// pill in the Pages tab.
type PageTestResult struct {
	Status         string `json:"status"`
	Message        string `json:"message,omitempty"`
	PageName       string `json:"pageName,omitempty"`
	FollowersCount int    `json:"followersCount,omitempty"`
}
