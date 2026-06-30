// Package service provides a thin HTTP client for the Node.js Playwright sidecar.
package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SidecarClient talks to the Node.js sidecar on localhost.
type SidecarClient struct {
	baseURL string
	client  *http.Client
}

// NewSidecarClient creates a client with the given base URL.
func NewSidecarClient(baseURL string) *SidecarClient {
	return &SidecarClient{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 120 * time.Second},
	}
}

// CrawlPost holds a single post returned by the sidecar crawler.
type CrawlPost struct {
	ID          string   `json:"id"`
	PageID      string   `json:"pageId"`
	PageName    string   `json:"pageName"`
	Content     string   `json:"content"`
	FullContent string   `json:"fullContent"`
	MediaURLs   []string `json:"mediaUrls"`
	VideoURLs   []string `json:"videoUrls"`
	// ThumbnailURLs is the first 4 mediaUrls, suitable for a preview
	// strip. For reel/video posts the first entry is the video
	// thumbnail (scontent fbcdn jpg). The FE prefers this over
	// mediaUrls[0] so the contract is explicit.
	ThumbnailURLs []string `json:"thumbnailUrls"`
	// FullPicture is the canonical "cover image" for the post
	// (mediaUrls[0] or empty). FB OG scrapers use this.
	FullPicture string `json:"fullPicture"`
	MediaType   string `json:"mediaType"`
	Likes       int    `json:"likes"`
	Comments    int    `json:"comments"`
	Shares      int    `json:"shares"`
	// ReactionIcons are the colored reaction emoji image URLs the
	// sidecar pulled from the "See who reacted" toolbar. The FE
	// renders them as <img> so the user sees the same like/love/
	// haha row FB itself shows, instead of plain unicode (which
	// doesn't carry the FB-specific colors).
	ReactionIcons []string `json:"reactionIcons"`
	PostedAt      string   `json:"postedAt"`
	Permalink     string   `json:"permalink"`
}

// CrawlResponse is the envelope from POST /crawl.
type CrawlResponse struct {
	Success bool        `json:"success"`
	Posts   []CrawlPost `json:"posts"`
	Error   string      `json:"error"`
}

// CrawlPage asks the sidecar to scrape posts from a public Facebook page.
// CrawlPage asks the sidecar to scrape a public Facebook page. The
// optional `profilePath` selects which Playwright user-data directory
// to launch — passing the path of a previously logged-in account
// means the request carries the same cookies as /account-login/start
// and Facebook is less likely to throttle or hard-redirect to /login.
// An empty profilePath falls back to the sidecar's default profile
// (no cookies) which is fine for fully public pages.
//
// The optional `until` is the upper-bound cutoff (exclusive end-of-day
// in caller-local time, see parseUntilDate). When non-nil the sidecar
// uses it to (a) increase the number of rounds it scrapes so the
// caller still has `limit` posts after filtering, and (b) drop posts
// newer than the cutoff before sending the response. The Go service
// runs the same filter itself as a safety net.
func (c *SidecarClient) CrawlPage(ctx context.Context, pageURL string, limit int, until *time.Time, profilePath string) ([]CrawlPost, error) {
	bodyMap := map[string]any{
		"pageUrl":     pageURL,
		"limit":       limit,
		"headless":    true,
		"profilePath": expandProfilePath(profilePath),
	}
	if until != nil {
		bodyMap["untilDate"] = until.Format(time.RFC3339Nano)
	}
	body, _ := json.Marshal(bodyMap)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/crawl", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("sidecar crawl %d: %s", resp.StatusCode, string(b))
	}
	var out CrawlResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if !out.Success {
		return nil, fmt.Errorf("sidecar crawl failed: %s", out.Error)
	}
	return out.Posts, nil
}

func expandProfilePath(profilePath string) string {
	if profilePath == "" || profilePath == "~" {
		if profilePath == "" {
			return ""
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return profilePath
		}
		return home
	}
	if strings.HasPrefix(profilePath, "~/") || strings.HasPrefix(profilePath, `~\`) {
		home, err := os.UserHomeDir()
		if err != nil {
			return profilePath
		}
		return filepath.Join(home, profilePath[2:])
	}
	return profilePath
}

// GroupCheckResult is the access-check result from the sidecar.
type GroupCheckResult struct {
	Joined    bool   `json:"joined"`
	CanPost   bool   `json:"canPost"`
	Status    string `json:"status"`
	Error     string `json:"error"`
	URL       string `json:"url"`
	GroupName string `json:"groupName"`
}

// GroupResolveResult is the result of resolving a group URL to an ID
// and (best-effort) display name.
type GroupResolveResult struct {
	GroupID      string `json:"groupId"`
	CanonicalURL string `json:"canonicalUrl"`
	Name         string `json:"name"`
}

// ResolveGroup asks the sidecar to extract a numeric group ID and
// (best-effort) display name from a Facebook group URL. Returns an
// error when the URL is unparseable (e.g. not a facebook.com/groups
// URL, or a slugged URL that we can't turn into an ID).
func (c *SidecarClient) ResolveGroup(ctx context.Context, url string) (*GroupResolveResult, error) {
	body, _ := json.Marshal(map[string]any{"url": url})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/group-resolve", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		// 400 is the sidecar's "unparseable URL" signal — surface it
		// as a clean error so the handler can return 400 too.
		return nil, fmt.Errorf("sidecar group-resolve %d: %s", resp.StatusCode, string(b))
	}
	var out struct {
		Success      bool   `json:"success"`
		GroupID      string `json:"groupId"`
		CanonicalURL string `json:"canonicalUrl"`
		Name         string `json:"name"`
		Error        string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if !out.Success {
		return nil, fmt.Errorf("sidecar group-resolve failed: %s", out.Error)
	}
	return &GroupResolveResult{
		GroupID:      out.GroupID,
		CanonicalURL: out.CanonicalURL,
		Name:         out.Name,
	}, nil
}

// CheckGroupAccess asks the sidecar whether an account can post to a group.
func (c *SidecarClient) CheckGroupAccess(ctx context.Context, profilePath, groupID string) (*GroupCheckResult, error) {
	body, _ := json.Marshal(map[string]any{"profilePath": expandProfilePath(profilePath), "groupId": groupID, "headless": true})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/group-check", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out struct {
		Success bool             `json:"success"`
		Result  GroupCheckResult `json:"result"`
		Error   string           `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if !out.Success {
		return nil, fmt.Errorf("sidecar group-check failed: %s", out.Error)
	}
	return &out.Result, nil
}

// PostToGroupResult is the result of a group post.
type PostToGroupResult struct {
	Success bool   `json:"success"`
	PostURL string `json:"postUrl"`
	Error   string `json:"error"`
}

// PostToGroup asks the sidecar to publish a post to a Facebook group.
func (c *SidecarClient) PostToGroup(ctx context.Context, profilePath, groupID, caption string, mediaURLs []string, anonymousPosting bool) (*PostToGroupResult, error) {
	body, _ := json.Marshal(map[string]any{
		"profilePath":      expandProfilePath(profilePath),
		"groupId":          groupID,
		"caption":          caption,
		"mediaUrls":        mediaURLs,
		"headless":         true,
		"anonymousPosting": anonymousPosting,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/group-post", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out struct {
		Success bool              `json:"success"`
		Result  PostToGroupResult `json:"result"`
		Error   string            `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if !out.Success {
		return nil, fmt.Errorf("sidecar group-post failed: %s", out.Error)
	}
	return &out.Result, nil
}

// PostToProfileResult mirrors PostToGroupResult but lives in its own
// type so callers reading from the Kanban flow don't accidentally
// consume a group-post result.
type PostToProfileResult struct {
	Success bool   `json:"success"`
	PostURL string `json:"postUrl"`
	Error   string `json:"error"`
}

// PostToProfile asks the sidecar to publish a post to the
// kit-account's own personal timeline. Used by the FB-content
// crawl → brain → schedule → Playwright auto-publish flow
// (post_type='personal' rows). The sidecar drives the visible
// composer on /me because FB blocks /me/feed via the Graph API for
// non-page accounts.
//
// profilePath is the directory of the kit-account's Chromium
// profile (the same one used by /account-login/start). mediaURLs
// are downloaded by the sidecar before upload.
func (c *SidecarClient) PostToProfile(ctx context.Context, profilePath, caption string, mediaURLs []string) (*PostToProfileResult, error) {
	body, _ := json.Marshal(map[string]any{
		"profilePath": expandProfilePath(profilePath),
		"caption":     caption,
		"mediaUrls":   mediaURLs,
		"headless":    true,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/profile-post", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("sidecar profile-post %d: %s", resp.StatusCode, string(b))
	}
	var out struct {
		Success bool               `json:"success"`
		Result  PostToProfileResult `json:"result"`
		Error   string             `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if !out.Success {
		return nil, fmt.Errorf("sidecar profile-post failed: %s", out.Error)
	}
	return &out.Result, nil
}

// KlingGenerateResponse is the envelope from POST /kling/generate.
type KlingGenerateResponse struct {
	Success bool     `json:"success"`
	Paths   []string `json:"paths"`
	Error   string   `json:"error"`
}

// GenerateKlingImages asks the sidecar to generate images on kling.ai.
func (c *SidecarClient) GenerateKlingImages(ctx context.Context, prompt string, count int, options map[string]string) ([]string, error) {
	body, _ := json.Marshal(map[string]any{"prompt": prompt, "count": count, "type": "image", "options": options, "headless": false})
	return c.klingGenerate(ctx, body)
}

// GenerateKlingVideos asks the sidecar to generate videos on kling.ai.
func (c *SidecarClient) GenerateKlingVideos(ctx context.Context, prompt string, count int, options map[string]string) ([]string, error) {
	body, _ := json.Marshal(map[string]any{"prompt": prompt, "count": count, "type": "video", "options": options, "headless": false})
	return c.klingGenerate(ctx, body)
}

func (c *SidecarClient) klingGenerate(ctx context.Context, body []byte) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/kling/generate", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out KlingGenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if !out.Success {
		return nil, fmt.Errorf("sidecar kling failed: %s", out.Error)
	}
	return out.Paths, nil
}

// AccountLoginSession is the in-memory Playwright login session that the
// sidecar manages. The plugin polls the same ID until status is
// "completed" or "failed".
type AccountLoginSession struct {
	SessionID   string `json:"sessionId"`
	Status      string `json:"status"`
	ProfilePath string `json:"profilePath,omitempty"`
	LastError   string `json:"lastError,omitempty"`
}

// StartAccountLogin kicks off a visible Playwright login for a given
// profile. If password is non-empty the sidecar will fill the password
// field and submit before pausing for the user to clear 2FA / checkpoint.
// Returns the session ID used to poll status.
func (c *SidecarClient) StartAccountLogin(ctx context.Context, profilePath, email, password string) (*AccountLoginSession, error) {
	body, _ := json.Marshal(map[string]any{
		"profilePath": expandProfilePath(profilePath),
		"email":       email,
		"password":    password,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/account-login/start", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("sidecar account-login %d: %s", resp.StatusCode, string(b))
	}
	var out struct {
		Success   bool   `json:"success"`
		SessionID string `json:"sessionId"`
		Status    string `json:"status"`
		Error     string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if !out.Success {
		return nil, fmt.Errorf("sidecar account-login failed: %s", out.Error)
	}
	return &AccountLoginSession{SessionID: out.SessionID, Status: out.Status}, nil
}

// CheckAccountLoginStatus polls the sidecar for the current status of a
// Playwright login session.
func (c *SidecarClient) CheckAccountLoginStatus(ctx context.Context, sessionID string) (*AccountLoginSession, error) {
	url := fmt.Sprintf("%s/account-login/status?sessionId=%s", c.baseURL, sessionID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("sidecar account-login status %d: %s", resp.StatusCode, string(b))
	}
	var out AccountLoginSession
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}
