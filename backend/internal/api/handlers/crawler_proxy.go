// Package handlers — crawler_proxy.go proxies plugin requests to a
// separate mdp-crawler Python process.
//
// Why this exists
// ----------------
// Tauri 2's WebView2 blocks the plugin's raw `fetch()` to a sibling
// loopback process. The plugin already talks to the Go backend via the
// IPC bridge (or direct fetch on the backend's own port — both are
// whitelisted), so the cleanest path is for the Go backend to proxy
// /api/sources, /api/launch/status, /api/crawl, /api/trends on behalf
// of the plugin. The plugin sees only the backend.
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// CrawlerProxy forwards selected /crawler/* paths to the configured
// mdp-crawler base URL. Returns 503 when MDP_CRAWLER_URL is empty
// (crawler not wired) and 502 when the upstream call fails — the
// plugin renders the 503 as "mdp-crawler not configured" and the 502
// as a transient connection error.
type CrawlerProxy struct {
	baseURL string // e.g. "http://localhost:9123"
	hc      *http.Client
}

// NewCrawlerProxy builds a proxy. baseURL is read from
// config.Config.CrawlerURL; empty disables the proxy (handler still
// registers but always returns 503).
func NewCrawlerProxy(baseURL string) *CrawlerProxy {
	return &CrawlerProxy{
		baseURL: strings.TrimRight(baseURL, "/"),
		hc: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (p *CrawlerProxy) enabled() bool { return p.baseURL != "" }

// Sources GET /crawler/sources — passthrough to mdp-crawler /api/sources.
func (p *CrawlerProxy) Sources(c *gin.Context) {
	if !p.enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "crawler proxy not configured"})
		return
	}
	p.passthrough(c, http.MethodGet, "/api/sources", nil)
}

// LaunchStatus GET /crawler/launch/status — passthrough.
func (p *CrawlerProxy) LaunchStatus(c *gin.Context) {
	if !p.enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "crawler proxy not configured"})
		return
	}
	p.passthrough(c, http.MethodGet, "/api/launch/status", nil)
}

// Crawl POST /crawler/crawl — body is forwarded as-is so the plugin
// can pass {source: <id>, profile_dir: <path>, port: 9222}.
func (p *CrawlerProxy) Crawl(c *gin.Context) {
	if !p.enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "crawler proxy not configured"})
		return
	}
	body, _ := io.ReadAll(c.Request.Body)
	p.passthrough(c, http.MethodPost, "/api/crawl", body)
}

// Trends GET /crawler/trends?limit=N — passthrough with query string.
func (p *CrawlerProxy) Trends(c *gin.Context) {
	if !p.enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "crawler proxy not configured"})
		return
	}
	target := "/api/trends"
	if raw := c.Request.URL.RawQuery; raw != "" {
		target += "?" + raw
	}
	p.passthrough(c, http.MethodGet, target, nil)
}

// Browsers GET /crawler/browsers — list installed browsers and their
// Chrome user profiles. Used by the Crawl tab's "Tài khoản đăng"
// dropdown so the user can pick a real Chrome profile (mdp-crawler
// reads the on-disk User Data dir) instead of a row in fb_accounts.
func (p *CrawlerProxy) Browsers(c *gin.Context) {
	if !p.enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "crawler proxy not configured"})
		return
	}
	p.passthrough(c, http.MethodGet, "/api/browsers", nil)
}

// passthrough performs the upstream call and copies the response back.
// 4xx/5xx from upstream are passed through verbatim so the plugin sees
// the same status it would get from a direct call.
func (p *CrawlerProxy) passthrough(c *gin.Context, method, path string, body []byte) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, bodyReader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.hc.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	// Forward content-type so JSON comes back as JSON, etc.
	ct := resp.Header.Get("Content-Type")
	if ct != "" {
		c.Header("Content-Type", ct)
	}
	c.Status(resp.StatusCode)
	// Best-effort pretty-error so the plugin's `Failed to fetch` toast
	// surfaces something actionable when mdp-crawler is down.
	if resp.StatusCode >= 400 {
		// Try to preserve JSON body; if not JSON, wrap as plain error.
		var parsed any
		if json.Unmarshal(respBody, &parsed) == nil {
			c.JSON(resp.StatusCode, parsed)
			return
		}
		c.JSON(resp.StatusCode, gin.H{"error": string(respBody)})
		return
	}
	_, _ = c.Writer.Write(respBody)
}