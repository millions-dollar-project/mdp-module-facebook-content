// Package fb is a thin wrapper around the Facebook Graph API (v18.0+).
// We deliberately avoid the official facebook-nodejs-business SDK and
// write the few calls we need by hand — fewer deps, fewer surprises.
package fb

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/telemetry"
)

// Config bundles the Graph API endpoint config the client needs.
type Config struct {
	BaseURL       string        // e.g. "https://graph.facebook.com"
	APIVersion    string        // e.g. "v18.0"
	HTTPTimeout   time.Duration // per-request timeout
	MaxRetries    int           // attempts before giving up
	InitialBackoff time.Duration // first retry sleeps this long
}

// Client is a small, retry-aware wrapper for the few Graph endpoints we
// actually call: GetPageInfo (for test-connection) and PostToPageFeed
// (for publish). It is safe for concurrent use.
type Client struct {
	cfg  Config
	http *http.Client
}

// NewClient returns a Client with sensible defaults applied if cfg
// leaves a field zero.
func NewClient(cfg Config) *Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://graph.facebook.com"
	}
	if cfg.APIVersion == "" {
		cfg.APIVersion = "v18.0"
	}
	if cfg.HTTPTimeout == 0 {
		cfg.HTTPTimeout = 15 * time.Second
	}
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = 3
	}
	if cfg.InitialBackoff == 0 {
		cfg.InitialBackoff = 500 * time.Millisecond
	}
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: cfg.HTTPTimeout},
	}
}

// PageInfo is the subset of /me?fields=id,name,fan_count we surface to
// handlers. Facebook returns more; we just don't care.
type PageInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	FanCount int    `json:"fan_count"`
}

// GetPageInfo calls `/{page-id}?fields=id,name,fan_count&access_token=...`
// and returns the result. Used by POST test-page-connection.
func (c *Client) GetPageInfo(ctx context.Context, pageID, accessToken string) (*PageInfo, error) {
	endpoint := fmt.Sprintf("%s/%s/%s?fields=id,name,fan_count&access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, pageID, url.QueryEscape(accessToken))

	var info PageInfo
	if err := c.doWithRetry(ctx, http.MethodGet, endpoint, nil, "", &info); err != nil {
		return nil, err
	}
	return &info, nil
}

// PostToPageFeed publishes a text post to the given page. Returns the
// newly-created FB post ID. Phase 3 will add photo/video/link support.
func (c *Client) PostToPageFeed(ctx context.Context, pageID, accessToken, message string) (string, error) {
	endpoint := fmt.Sprintf("%s/%s/%s/feed",
		c.cfg.BaseURL, c.cfg.APIVersion, pageID)

	form := url.Values{}
	form.Set("message", message)
	form.Set("access_token", accessToken)

	var resp struct {
		ID string `json:"id"`
	}
	if err := c.doWithRetry(ctx, http.MethodPost, endpoint, []byte(form.Encode()), "application/x-www-form-urlencoded", &resp); err != nil {
		return "", err
	}
	if resp.ID == "" {
		return "", fmt.Errorf("graph API returned empty post id")
	}
	return resp.ID, nil
}

// ─── Messenger ────────────────────────────────────────────────────────

type ConversationParticipant struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ConversationSummary struct {
	ID           string                    `json:"id"`
	Link         string                    `json:"link"`
	UpdatedTime  fbTime                  `json:"updated_time"`
	MessageCount int                       `json:"message_count"`
	UnreadCount  int                       `json:"unread_count"`
	Participants struct {
		Data []ConversationParticipant `json:"data"`
	} `json:"participants"`
}

// fbTime wraps time.Time to support Facebook's non-RFC3339 formats like
// "2026-06-09T11:50:37+0000" (missing colon in offset).
type fbTime time.Time

func (t *fbTime) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	if s == "" {
		return nil
	}
	// Facebook sometimes sends +0000 instead of +00:00
	parsed, err := time.Parse("2006-01-02T15:04:05Z07:00", s)
	if err != nil {
		parsed, err = time.Parse("2006-01-02T15:04:05-07:00", s)
	}
	if err != nil {
		parsed, err = time.Parse("2006-01-02T15:04:05-0700", s)
	}
	if err != nil {
		parsed, err = time.Parse("2006-01-02T15:04:05Z", s)
	}
	if err != nil {
		return err
	}
	*t = fbTime(parsed)
	return nil
}

func (t fbTime) Time() time.Time {
	return time.Time(t)
}

type conversationListEnvelope struct {
	Data []ConversationSummary `json:"data"`
}

// GetConversations lists page conversations ordered by updated_time desc.
func (c *Client) GetConversations(ctx context.Context, pageID, accessToken string, limit int) ([]ConversationSummary, error) {
	endpoint := fmt.Sprintf("%s/%s/%s/conversations?fields=id,link,updated_time,message_count,unread_count,participants&limit=%d&access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, pageID, limit, url.QueryEscape(accessToken))

	var env conversationListEnvelope
	if err := c.doWithRetry(ctx, http.MethodGet, endpoint, nil, "", &env); err != nil {
		return nil, err
	}
	return env.Data, nil
}

type MessageSender struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type MessageData struct {
	ID          string        `json:"id"`
	CreatedTime time.Time     `json:"created_time"`
	From        MessageSender `json:"from"`
	Message     string        `json:"message"`
}

type messageListEnvelope struct {
	Data []MessageData `json:"data"`
}

// GetMessages fetches messages inside a single conversation thread.
func (c *Client) GetMessages(ctx context.Context, conversationID, accessToken string, limit int) ([]MessageData, error) {
	endpoint := fmt.Sprintf("%s/%s/%s/messages?fields=id,created_time,from,message&limit=%d&access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, conversationID, limit, url.QueryEscape(accessToken))

	var env messageListEnvelope
	if err := c.doWithRetry(ctx, http.MethodGet, endpoint, nil, "", &env); err != nil {
		return nil, err
	}
	return env.Data, nil
}

// SendTextMessage sends a text message to a PSID via the Page-scoped Send API.
func (c *Client) SendTextMessage(ctx context.Context, pageID, recipientID, text, accessToken string) (string, error) {
	// Facebook prefers the /me/messages endpoint with page access token.
	endpoint := fmt.Sprintf("%s/%s/me/messages?access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, url.QueryEscape(accessToken))

	payload := map[string]any{
		"recipient": map[string]string{"id": recipientID},
		"message":   map[string]string{"text": text},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal message payload: %w", err)
	}

	var resp struct {
		MessageID string `json:"message_id"`
	}
	if err := c.doWithRetry(ctx, http.MethodPost, endpoint, raw, "application/json", &resp); err != nil {
		return "", err
	}
	return resp.MessageID, nil
}

// ─── Comments ─────────────────────────────────────────────────────────

type CommentFrom struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type CommentData struct {
	ID           string      `json:"id"`
	From         CommentFrom `json:"from"`
	Message      string      `json:"message"`
	CreatedTime  time.Time   `json:"created_time"`
	LikeCount    int         `json:"like_count"`
	CommentCount int         `json:"comment_count"`
	CanReply     bool        `json:"can_reply"`
	IsHidden     bool        `json:"is_hidden"`
}

type commentListEnvelope struct {
	Data []CommentData `json:"data"`
}

// GetComments fetches top-level comments on a post.
func (c *Client) GetComments(ctx context.Context, postID, accessToken string, limit int) ([]CommentData, error) {
	endpoint := fmt.Sprintf("%s/%s/%s/comments?fields=id,from,message,created_time,like_count,comment_count,can_reply,is_hidden&limit=%d&access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, postID, limit, url.QueryEscape(accessToken))

	var env commentListEnvelope
	if err := c.doWithRetry(ctx, http.MethodGet, endpoint, nil, "", &env); err != nil {
		return nil, err
	}
	return env.Data, nil
}

// ReplyToComment posts a public reply under a comment.
func (c *Client) ReplyToComment(ctx context.Context, commentID, message, accessToken string) (string, error) {
	endpoint := fmt.Sprintf("%s/%s/%s/comments?access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, commentID, url.QueryEscape(accessToken))

	form := url.Values{}
	form.Set("message", message)

	var resp struct {
		ID string `json:"id"`
	}
	if err := c.doWithRetry(ctx, http.MethodPost, endpoint, []byte(form.Encode()), "application/x-www-form-urlencoded", &resp); err != nil {
		return "", err
	}
	return resp.ID, nil
}

// LikeComment likes a comment (or any object).
func (c *Client) LikeComment(ctx context.Context, commentID, accessToken string) error {
	endpoint := fmt.Sprintf("%s/%s/%s/likes?access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, commentID, url.QueryEscape(accessToken))

	return c.doWithRetry(ctx, http.MethodPost, endpoint, nil, "", nil)
}

// SendPrivateReply sends a private message to a comment author.
func (c *Client) SendPrivateReply(ctx context.Context, commentID, message, accessToken string) (string, error) {
	endpoint := fmt.Sprintf("%s/%s/%s/private_replies?access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, commentID, url.QueryEscape(accessToken))

	form := url.Values{}
	form.Set("message", message)

	var resp struct {
		ID string `json:"id"`
	}
	if err := c.doWithRetry(ctx, http.MethodPost, endpoint, []byte(form.Encode()), "application/x-www-form-urlencoded", &resp); err != nil {
		return "", err
	}
	return resp.ID, nil
}

// ─── Users / Posts ────────────────────────────────────────────────────

type UserProfile struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Picture   struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	} `json:"picture"`
}

// GetUserProfile fetches basic public profile (name + picture) for a user.
func (c *Client) GetUserProfile(ctx context.Context, userID, accessToken string) (*UserProfile, error) {
	endpoint := fmt.Sprintf("%s/%s/%s?fields=id,name,picture&access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, userID, url.QueryEscape(accessToken))

	var prof UserProfile
	if err := c.doWithRetry(ctx, http.MethodGet, endpoint, nil, "", &prof); err != nil {
		return nil, err
	}
	return &prof, nil
}

type PostData struct {
	ID            string    `json:"id"`
	Message       string    `json:"message"`
	CreatedTime   time.Time `json:"created_time"`
	PermalinkURL  string    `json:"permalink_url"`
	LikesSummary  struct {
		TotalCount int `json:"total_count"`
	} `json:"likes"`
	CommentsSummary struct {
		TotalCount int `json:"total_count"`
	} `json:"comments"`
}

type postListEnvelope struct {
	Data []PostData `json:"data"`
}

// GetPosts lists recent posts for a page.
func (c *Client) GetPosts(ctx context.Context, pageID, accessToken string, limit int) ([]PostData, error) {
	endpoint := fmt.Sprintf("%s/%s/%s/posts?fields=id,message,created_time,permalink_url,likes.summary(true),comments.summary(true)&limit=%d&access_token=%s",
		c.cfg.BaseURL, c.cfg.APIVersion, pageID, limit, url.QueryEscape(accessToken))

	var env postListEnvelope
	if err := c.doWithRetry(ctx, http.MethodGet, endpoint, nil, "", &env); err != nil {
		return nil, err
	}
	return env.Data, nil
}

// graphError is the shape of Facebook's error envelope. We only care
// about Code (to decide retry) and Message (to surface to callers).
type graphError struct {
	Error struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

// doWithRetry POSTs or GETs, decoding the response into out. Retries on
// transient failures (network errors, 5xx, known-retryable codes) up
// to cfg.MaxRetries times. Does NOT retry on 4xx or on Facebook's
// no-retry codes: 100 (invalid param), 10 (permission), 200 (auth),
// 613 (rate limit too long), 80001 (long-term throttle).
func (c *Client) doWithRetry(ctx context.Context, method, endpoint string, body []byte, contentType string, out any) error {
	noRetryCodes := map[int]bool{
		100: true, 10: true, 200: true, 613: true, 80001: true,
	}

	// Extract a short label for the endpoint path (e.g. "/v18.0/123/messages")
	label := endpoint
	if u, err := url.Parse(endpoint); err == nil {
		label = u.Path
	}

	var lastErr error
	backoff := c.cfg.InitialBackoff

	for attempt := 1; attempt <= c.cfg.MaxRetries; attempt++ {
		telemetry.GraphAPICalls.WithLabelValues(method, label).Inc()

		var bodyReader io.Reader
		if body != nil {
			bodyReader = bytes.NewReader(body)
		}
		req, err := http.NewRequestWithContext(ctx, method, endpoint, bodyReader)
		if err != nil {
			return fmt.Errorf("build request: %w", err)
		}
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = err
			telemetry.GraphAPIErrors.WithLabelValues(method, label, "network").Inc()
		} else {
			raw, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				lastErr = readErr
				telemetry.GraphAPIErrors.WithLabelValues(method, label, "read_body").Inc()
			} else if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				if out != nil {
					return json.Unmarshal(raw, out)
				}
				return nil
			} else {
				var ge graphError
				if jsonErr := json.Unmarshal(raw, &ge); jsonErr == nil && ge.Error.Code != 0 {
					lastErr = fmt.Errorf("graph API error %d (%s): %s",
						ge.Error.Code, ge.Error.Type, ge.Error.Message)
					telemetry.GraphAPIErrors.WithLabelValues(method, label, fmt.Sprintf("fb_%d", ge.Error.Code)).Inc()
					if noRetryCodes[ge.Error.Code] {
						return lastErr
					}
				} else {
					lastErr = fmt.Errorf("graph API HTTP %d: %s", resp.StatusCode, string(raw))
					telemetry.GraphAPIErrors.WithLabelValues(method, label, fmt.Sprintf("http_%d", resp.StatusCode)).Inc()
					if resp.StatusCode < 500 {
						// 4xx other than the known no-retry codes — don't retry
						return lastErr
					}
				}
			}
		}

		// Don't sleep after the last attempt.
		if attempt == c.cfg.MaxRetries {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
		backoff *= 2
	}
	return fmt.Errorf("graph API: exhausted %d attempts: %w", c.cfg.MaxRetries, lastErr)
}
