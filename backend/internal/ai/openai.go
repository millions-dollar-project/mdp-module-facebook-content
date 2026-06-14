// Package ai is a thin, zero-dep wrapper around the OpenAI Chat Completions API.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Config holds the endpoint and retry behaviour.
type Config struct {
	BaseURL       string
	APIKey        string
	Model         string        // e.g. "gpt-4o-mini"
	HTTPTimeout   time.Duration
	MaxRetries    int
	InitialBackoff time.Duration
}

// NewClient returns a Client with sensible defaults.
func NewClient(cfg Config) *Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.openai.com/v1"
	}
	if cfg.Model == "" {
		cfg.Model = "gpt-4o-mini"
	}
	if cfg.HTTPTimeout == 0 {
		cfg.HTTPTimeout = 30 * time.Second
	}
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = 3
	}
	if cfg.InitialBackoff == 0 {
		cfg.InitialBackoff = 500 * time.Millisecond
	}
	return &Client{
		cfg: cfg,
		http: &http.Client{Timeout: cfg.HTTPTimeout},
	}
}

// Client is safe for concurrent use.
type Client struct {
	cfg  Config
	http *http.Client
}

// Model returns the configured default model.
func (c *Client) Model() string { return c.cfg.Model }

// Message is a single turn in the chat.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// CompletionRequest is sent to /chat/completions.
type CompletionRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
}

// CompletionResponse is the successful envelope.
type CompletionResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

// Complete sends a chat request and returns the assistant reply text.
func (c *Client) Complete(ctx context.Context, req CompletionRequest) (string, error) {
	if req.Model == "" {
		req.Model = c.cfg.Model
	}
	raw, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	endpoint := c.cfg.BaseURL + "/chat/completions"
	var lastErr error
	backoff := c.cfg.InitialBackoff

	for attempt := 1; attempt <= c.cfg.MaxRetries; attempt++ {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
		if err != nil {
			return "", fmt.Errorf("build request: %w", err)
		}
		httpReq.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := c.http.Do(httpReq)
		if err != nil {
			lastErr = err
		} else {
			body, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				lastErr = readErr
			} else if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				var out CompletionResponse
				if jerr := json.Unmarshal(body, &out); jerr != nil {
					return "", fmt.Errorf("unmarshal response: %w", jerr)
				}
				if len(out.Choices) == 0 {
					return "", fmt.Errorf("openai returned no choices")
				}
				return out.Choices[0].Message.Content, nil
			} else {
				lastErr = fmt.Errorf("openai HTTP %d: %s", resp.StatusCode, string(body))
				if resp.StatusCode >= 400 && resp.StatusCode < 500 {
					return "", lastErr
				}
			}
		}

		if attempt == c.cfg.MaxRetries {
			break
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(backoff):
		}
		backoff *= 2
	}
	return "", fmt.Errorf("openai: exhausted %d attempts: %w", c.cfg.MaxRetries, lastErr)
}
