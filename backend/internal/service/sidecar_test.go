package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeSidecar captures the most recent /account-login/* call so the
// tests can assert the backend forwarded the right payload to the
// sidecar. Returns the canned response the test wants to mock.
type fakeSidecar struct {
	t              *testing.T
	startReq       map[string]any
	startSessionID string
	startStatus    string

	// group-resolve mock state
	resolveReq  map[string]any
	resolveID   string
	resolveName string
	resolveErr  string
	resolveCode int // HTTP status code to return (defaults to 200)
}

func (f *fakeSidecar) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/account-login/start", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.startReq = body
		resp := map[string]any{
			"success":   true,
			"sessionId": f.startSessionID,
			"status":    f.startStatus,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
	mux.HandleFunc("/account-login/status", func(w http.ResponseWriter, r *http.Request) {
		_ = r
		resp := map[string]any{
			"success":     true,
			"status":      "running",
			"profilePath": "/tmp/x",
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
	mux.HandleFunc("/group-resolve", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.resolveReq = body
		code := f.resolveCode
		if code == 0 {
			code = 200
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		if code >= 400 {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": false,
				"error":   f.resolveErr,
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success":      true,
			"groupId":      f.resolveID,
			"canonicalUrl": "https://www.facebook.com/groups/" + f.resolveID + "/",
			"name":         f.resolveName,
		})
	})
	return mux
}

func TestExpandProfilePath(t *testing.T) {
	home, err := os.UserHomeDir()
	require.NoError(t, err)

	assert.Equal(t, "", expandProfilePath(""))
	assert.Equal(t, home, expandProfilePath("~"))
	assert.Equal(t, filepath.Join(home, ".mdp", "facebook", "profiles", "account-1"), expandProfilePath("~/.mdp/facebook/profiles/account-1"))
	assert.Equal(t, filepath.Join(home, ".mdp", "facebook", "profiles", "account-1"), expandProfilePath(`~\.mdp\facebook\profiles\account-1`))
	assert.Equal(t, "/tmp/profile", expandProfilePath("/tmp/profile"))
}

func TestSidecar_StartAccountLogin_ForwardsEmail(t *testing.T) {
	// The plugin sends (profilePath, email, "") — no password. The
	// sidecar pre-fills the identifier field with email and leaves
	// the browser visible so the user types the password themselves.
	f := &fakeSidecar{t: t, startSessionID: "abc123", startStatus: "running"}
	srv := httptest.NewServer(f.handler())
	t.Cleanup(srv.Close)

	c := NewSidecarClient(srv.URL)
	got, err := c.StartAccountLogin(context.Background(), "/tmp/profile", "user@example.com", "")
	require.NoError(t, err)
	assert.Equal(t, "abc123", got.SessionID)
	assert.Equal(t, "running", got.Status)

	require.NotNil(t, f.startReq, "sidecar should have received a body")
	assert.Equal(t, "/tmp/profile", f.startReq["profilePath"])
	assert.Equal(t, "user@example.com", f.startReq["email"])
	// Password is never sent in the new visible-browser flow.
	assert.Equal(t, "", f.startReq["password"], "password must stay empty in the new flow")
}

func TestSidecar_StartAccountLogin_NoEmail(t *testing.T) {
	// User opted not to pre-fill email. Sidecar still gets a clean call.
	f := &fakeSidecar{t: t, startSessionID: "s1", startStatus: "running"}
	srv := httptest.NewServer(f.handler())
	t.Cleanup(srv.Close)

	c := NewSidecarClient(srv.URL)
	got, err := c.StartAccountLogin(context.Background(), "/tmp/p2", "", "")
	require.NoError(t, err)
	assert.Equal(t, "s1", got.SessionID)
	assert.Equal(t, "", f.startReq["email"])
	assert.Equal(t, "", f.startReq["password"])
}

func TestSidecar_CheckAccountLoginStatus(t *testing.T) {
	f := &fakeSidecar{t: t}
	srv := httptest.NewServer(f.handler())
	t.Cleanup(srv.Close)

	c := NewSidecarClient(srv.URL)
	got, err := c.CheckAccountLoginStatus(context.Background(), "xyz")
	require.NoError(t, err)
	assert.Equal(t, "running", got.Status)
}

func TestSidecar_StartAccountLogin_ForwardsPassword(t *testing.T) {
	// Optional-password path: plugin sends a non-empty password, the
	// sidecar must receive it (and forward to Playwright) so it can
	// fill the form and submit before pausing for 2FA.
	f := &fakeSidecar{t: t, startSessionID: "p1", startStatus: "running"}
	srv := httptest.NewServer(f.handler())
	t.Cleanup(srv.Close)

	c := NewSidecarClient(srv.URL)
	got, err := c.StartAccountLogin(context.Background(), "/tmp/p3", "user@example.com", "s3cret")
	require.NoError(t, err)
	assert.Equal(t, "p1", got.SessionID)
	require.NotNil(t, f.startReq)
	assert.Equal(t, "s3cret", f.startReq["password"], "password must be forwarded when supplied so Playwright can fill the form")
	assert.Equal(t, "user@example.com", f.startReq["email"])
}

func TestSidecar_ResolveGroup_Success(t *testing.T) {
	// Happy path: sidecar returns groupId + name. Backend must
	// forward the URL the plugin sent and surface the resolved fields.
	f := &fakeSidecar{t: t, resolveID: "1234567890", resolveName: "Group mua bán test"}
	srv := httptest.NewServer(f.handler())
	t.Cleanup(srv.Close)

	c := NewSidecarClient(srv.URL)
	got, err := c.ResolveGroup(context.Background(), "https://www.facebook.com/groups/1234567890")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "1234567890", got.GroupID)
	assert.Equal(t, "Group mua bán test", got.Name)
	assert.Equal(t, "https://www.facebook.com/groups/1234567890/", got.CanonicalURL)
	require.NotNil(t, f.resolveReq)
	assert.Equal(t, "https://www.facebook.com/groups/1234567890", f.resolveReq["url"])
}

func TestSidecar_ResolveGroup_PrivateGroup_NameNull(t *testing.T) {
	// For gated/private groups the sidecar can still extract the ID
	// from the URL but can't read the name from the page. Name is the
	// empty string (JSON null). The Go client must not crash.
	f := &fakeSidecar{t: t, resolveID: "9876543210", resolveName: ""}
	srv := httptest.NewServer(f.handler())
	t.Cleanup(srv.Close)

	c := NewSidecarClient(srv.URL)
	got, err := c.ResolveGroup(context.Background(), "https://www.facebook.com/groups/9876543210")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "9876543210", got.GroupID)
	assert.Equal(t, "", got.Name)
}

func TestSidecar_ResolveGroup_BadURL(t *testing.T) {
	// Sidecar returns 400 for an unparseable URL — the Go client
	// surfaces that as an error (handler turns it into a 400 to the
	// plugin).
	f := &fakeSidecar{t: t, resolveCode: 400, resolveErr: "URL không đúng định dạng nhóm Facebook"}
	srv := httptest.NewServer(f.handler())
	t.Cleanup(srv.Close)

	c := NewSidecarClient(srv.URL)
	_, err := c.ResolveGroup(context.Background(), "https://example.com/groups/12345")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "400")
}
