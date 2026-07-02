// Package config loads runtime configuration from environment variables.
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// AIModel is one entry in the brain/ai-models dropdown shown to
// the user when they ask the AI to generate N drafts from crawled
// context. Configured via MDP_BRAIN_AI_MODELS (a JSON array) so
// ops can rotate the provider list without redeploying the
// plugin. Defaults to a small fixed list if the env var is empty.
type AIModel struct {
	ID    string `json:"id"`    // e.g. "gpt-4o"
	Label string `json:"label"` // e.g. "GPT-4o"
}

// DefaultAIModels is the fallback list exposed by GET /brain/ai-models
// when MDP_BRAIN_AI_MODELS is unset. Covers the three big labs the
// team is currently evaluating; ops can override at any time without
// a code change.
var DefaultAIModels = []AIModel{
	{ID: "gpt-4o", Label: "GPT-4o"},
	{ID: "claude-sonnet-4-6", Label: "Claude Sonnet 4"},
	{ID: "gemini-2.5-pro", Label: "Gemini 2.5 Pro"},
	{ID: "deepseek-v3", Label: "DeepSeek V3"},
}

// Config is the in-memory representation of all runtime knobs.
type Config struct {
	// --- HTTP server ---
	Port            string        // HTTP port, e.g. ":8081" (with leading colon for http.Server.Addr)
	LogLevel        string        // "debug" | "info" | "warn" | "error"
	ShutdownTimeout time.Duration // graceful shutdown timeout
	RequestTimeout  time.Duration // outbound HTTP timeout (Graph API)

	// --- Database ---
	DatabaseURL string // postgres:// connection string

	// --- Background worker ---
	WorkerInterval time.Duration

	// --- Encryption at rest ---
	EncryptionKey string // hex-encoded 32-byte AES-256 key; empty = no-op

	// --- Facebook Graph API ---
	FacebookAppID       string // public
	FacebookAppSecret   string // SECRET — never log or return via API
	FacebookVerifyToken string // shared secret for webhook challenge
	GraphAPIVersion     string // e.g. "v18.0"
	GraphAPIBase        string // e.g. "https://graph.facebook.com"

	// --- Sidecar (Node.js Playwright micro-service) ---
	SidecarURL         string // e.g. "http://localhost:9002"
	SidecarAutostart   bool   // spawn sidecar as a child process if not already running
	SidecarScriptPath  string // absolute path to sidecar/src/index.js
	SidecarNodeBin     string // path to node binary
	SidecarStartTimeout time.Duration // how long to wait for /health after spawn

	// --- mdp-crawler (separate Python process for "Tài khoản của tôi" crawl) ---
	// Proxied via the backend because Tauri 2's WebView2 blocks the
	// plugin's direct fetch() to a sibling loopback process. Empty
	// string = crawler proxy disabled.
	CrawlerURL string // e.g. "http://localhost:9123"

	// --- AI providers (Phase 3+; Phase 2 uses echo stub regardless) ---
	OpenAIAPIKey     string
	OpenAIModel      string
	KlingAPIKey      string
	KlingAPIBase     string
	AIProviderText   string // "openai" | "echo"
	AIProviderVisual string // "kling" | "echo"

	// BrainAIModels is the dropdown list shown to the user in the
	// "Tạo bài từ crawl" modal. Loaded from MDP_BRAIN_AI_MODELS (a
	// JSON array of {"id":"...","label":"..."}). Empty / unset =
	// DefaultAIModels. We keep this on the Config so the HTTP
	// handler can read it without a separate DI pass.
	BrainAIModels []AIModel

	// --- Google Sheets auto-export (Phase 3+) ---
	GoogleSheetsSpreadsheetID      string
	GoogleSheetsServiceAccountJSON  string // raw JSON; preferred when no file path
	GoogleSheetsServiceAccountPath  string // fallback: file path
	GoogleSheetsExportHours         string // comma-separated "HH:MM"
}

// Load reads env vars, applies defaults, and validates. Returns an error
// when a required value is missing or malformed. The returned Config is
// safe to use directly; no further parsing required.
func Load() (*Config, error) {
	c := &Config{
		// HTTP
		Port:     getenv("PORT", "8081"),
		LogLevel: getenv("LOG_LEVEL", "info"),

		// DB
		DatabaseURL: os.Getenv("DATABASE_URL"),

		// Facebook
		FacebookAppID:       os.Getenv("FACEBOOK_APP_ID"),
		FacebookAppSecret:   os.Getenv("FACEBOOK_APP_SECRET"),
		FacebookVerifyToken: getenv("FACEBOOK_VERIFY_TOKEN", "facebook-verify-token"),
		GraphAPIVersion:     getenv("FACEBOOK_GRAPH_API_VERSION", "v18.0"),
		GraphAPIBase:        getenv("FACEBOOK_GRAPH_API_BASE", "https://graph.facebook.com"),

		// Encryption
		EncryptionKey: os.Getenv("ENCRYPTION_KEY"),

		// Sidecar
		SidecarURL:        getenv("SIDECAR_URL", "http://localhost:9002"),
		SidecarAutostart:  getenv("SIDECAR_AUTOSTART", "true") == "true",
		SidecarScriptPath: getenv("SIDECAR_SCRIPT_PATH", defaultSidecarScriptPath()),
		SidecarNodeBin:    getenv("SIDECAR_NODE_BIN", "node"),

		// mdp-crawler proxy
		CrawlerURL: getenv("MDP_CRAWLER_URL", "http://localhost:9123"),

		// AI
		OpenAIAPIKey:     os.Getenv("OPENAI_API_KEY"),
		OpenAIModel:      getenv("OPENAI_MODEL", "gpt-4.1-mini"),
		KlingAPIKey:      os.Getenv("KLING_API_KEY"),
		KlingAPIBase:     getenv("KLING_API_BASE", "https://api.klingai.com"),
		AIProviderText:   getenv("AI_PROVIDER_TEXT", "echo"),
		AIProviderVisual: getenv("AI_PROVIDER_VISUAL", "echo"),

		// Brain AI model list (override-able via env). Falls back to
		// DefaultAIModels if the env var is empty or unparseable.
		BrainAIModels: loadBrainAIModels(os.Getenv("MDP_BRAIN_AI_MODELS")),

		// Google Sheets
		GoogleSheetsSpreadsheetID:     os.Getenv("GOOGLE_SHEETS_SPREADSHEET_ID"),
		GoogleSheetsServiceAccountJSON: os.Getenv("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON"),
		GoogleSheetsServiceAccountPath: os.Getenv("GOOGLE_SHEETS_SERVICE_ACCOUNT_PATH"),
		GoogleSheetsExportHours:        getenv("GOOGLE_SHEETS_EXPORT_HOURS", "08:00,12:00,18:00,20:00"),
	}

	// Numeric durations with sensible defaults
	c.WorkerInterval = getDuration("WORKER_INTERVAL", 60*time.Second)
	c.ShutdownTimeout = getDuration("SHUTDOWN_TIMEOUT", 10*time.Second)
	c.RequestTimeout = getDuration("REQUEST_TIMEOUT", 15*time.Second)
	c.SidecarStartTimeout = getDuration("SIDECAR_START_TIMEOUT", 5*time.Second)

	if c.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	if c.Port == "" {
		return nil, errors.New("PORT is required")
	}
	// Normalise to ":8081" form for http.Server.Addr
	if c.Port[0] != ':' {
		c.Port = ":" + c.Port
	}
	return c, nil
}

func getenv(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

// loadBrainAIModels parses the JSON env var. Empty / invalid JSON
// silently falls back to DefaultAIModels — we never want a config
// typo to brick the /brain/ai-models endpoint. Returns a copy of
// the default slice (not a shared reference) so callers can mutate
// without surprising the next Load().
func loadBrainAIModels(raw string) []AIModel {
	if raw == "" {
		out := make([]AIModel, len(DefaultAIModels))
		copy(out, DefaultAIModels)
		return out
	}
	var parsed []AIModel
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		out := make([]AIModel, len(DefaultAIModels))
		copy(out, DefaultAIModels)
		return out
	}
	// Drop entries with no id — a dropdown with empty values would
	// 400 every subsequent /brain/generate-and-schedule call.
	clean := make([]AIModel, 0, len(parsed))
	for _, m := range parsed {
		if m.ID == "" {
			continue
		}
		if m.Label == "" {
			m.Label = m.ID
		}
		clean = append(clean, m)
	}
	if len(clean) == 0 {
		out := make([]AIModel, len(DefaultAIModels))
		copy(out, DefaultAIModels)
		return out
	}
	return clean
}

func getDuration(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return def
	}
	return d
}

// String redacts secrets for safe logging.
func (c *Config) String() string {
	return fmt.Sprintf(
		"Config{Port=%s, LogLevel=%s, WorkerInterval=%s, ShutdownTimeout=%s, GraphAPIVersion=%s, FacebookAppID=%s, "+
			"SidecarURL=%s, SidecarAutostart=%v, SidecarScriptPath=%s, SidecarNodeBin=%s, SidecarStartTimeout=%s, "+
			"AIProviderText=%s, AIProviderVisual=%s, OpenAIModel=%s, "+
			"GoogleSheetsSpreadsheetID=%s, GoogleSheetsExportHours=%s, "+
			"DatabaseURL=<redacted>, FacebookAppSecret=<redacted>, FacebookVerifyToken=<set>, "+
			"OpenAIAPIKey=<%s>, KlingAPIKey=<%s>, GoogleSheetsServiceAccountJSON=<%s>}",
		c.Port, c.LogLevel, c.WorkerInterval, c.ShutdownTimeout, c.GraphAPIVersion, c.FacebookAppID,
		c.SidecarURL, c.SidecarAutostart, c.SidecarScriptPath, c.SidecarNodeBin, c.SidecarStartTimeout,
		c.AIProviderText, c.AIProviderVisual, c.OpenAIModel,
		c.GoogleSheetsSpreadsheetID, c.GoogleSheetsExportHours,
		redact(c.OpenAIAPIKey), redact(c.KlingAPIKey), redact(c.GoogleSheetsServiceAccountJSON),
	)
}

// redact returns "<set>" if s is non-empty, "<empty>" otherwise. Used by
// String() to surface the presence of a secret without exposing it.
func redact(s string) string {
	if s == "" {
		return "empty"
	}
	return "set"
}

// defaultSidecarScriptPath returns the conventional path to the sidecar
// entry point relative to the backend's working directory. The sidecar
// lives one directory up at <repo>/mdp-module-facebook/sidecar/src/index.js.
// If that doesn't exist on disk (e.g. running from an unusual working
// directory) the caller should still pass an explicit SIDECAR_SCRIPT_PATH
// env var.
func defaultSidecarScriptPath() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "../sidecar/src/index.js"
	}
	return filepath.Join(cwd, "..", "sidecar", "src", "index.js")
}
