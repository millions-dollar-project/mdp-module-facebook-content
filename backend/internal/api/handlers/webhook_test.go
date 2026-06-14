package handlers_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func signWebhook(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func TestWebhook_VerifyGET_Success(t *testing.T) {
	srv, _ := newTestServer(t, nil)
	q := srv.URL + "/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc123"
	resp, err := http.Get(q)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, "abc123", string(body))
}

func TestWebhook_VerifyGET_WrongToken(t *testing.T) {
	srv, _ := newTestServer(t, nil)
	q := srv.URL + "/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=abc123"
	resp, err := http.Get(q)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestWebhook_ReceivePOST_Message(t *testing.T) {
	srv, d := newTestServer(t, nil)

	// Seed a page so the webhook can resolve the page ID.
	_, err := d.Pool.Exec(context.Background(),
		`INSERT INTO facebook.pages (page_id, page_name, page_access_token) VALUES ($1, $2, $3)`,
		"100", "Test Page", "EAA_TEST")
	require.NoError(t, err)

	payload := map[string]any{
		"object": "page",
		"entry": []map[string]any{
			{
				"id":   "100",
				"time": time.Now().Unix(),
				"messaging": []map[string]any{
					{
						"sender":    map[string]string{"id": "200"},
						"recipient": map[string]string{"id": "100"},
						"timestamp": time.Now().UnixMilli(),
						"message": map[string]string{
							"mid":  "mid.123",
							"text": "Hello from customer",
						},
					},
				},
			},
		},
	}
	body, _ := json.Marshal(payload)
	sig := signWebhook(body, "test-app-secret")

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Hub-Signature-256", sig)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Assert conversation created.
	var convID string
	err = d.Pool.QueryRow(context.Background(),
		`SELECT id FROM facebook.conversations WHERE customer_id = $1`, "200").Scan(&convID)
	require.NoError(t, err, "conversation should be created")
	require.NotEmpty(t, convID)

	// Assert message inserted.
	var msgCount int
	err = d.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM facebook.messages WHERE id = $1`, "mid.123").Scan(&msgCount)
	require.NoError(t, err)
	assert.Equal(t, 1, msgCount, "message should be inserted")
}

func TestWebhook_ReceivePOST_Idempotency(t *testing.T) {
	srv, d := newTestServer(t, nil)

	_, err := d.Pool.Exec(context.Background(),
		`INSERT INTO facebook.pages (page_id, page_name, page_access_token) VALUES ($1, $2, $3)`,
		"100", "Test Page", "EAA_TEST")
	require.NoError(t, err)

	payload := map[string]any{
		"object": "page",
		"entry": []map[string]any{
			{
				"id":   "100",
				"time": time.Now().Unix(),
				"messaging": []map[string]any{
					{
						"sender":    map[string]string{"id": "200"},
						"recipient": map[string]string{"id": "100"},
						"timestamp": time.Now().UnixMilli(),
						"message": map[string]string{
							"mid":  "mid.456",
							"text": "First message",
						},
					},
				},
			},
		},
	}
	body, _ := json.Marshal(payload)
	sig := signWebhook(body, "test-app-secret")

	// First delivery.
	req1, _ := http.NewRequest(http.MethodPost, srv.URL+"/webhook", bytes.NewReader(body))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("X-Hub-Signature-256", sig)
	resp1, err := http.DefaultClient.Do(req1)
	require.NoError(t, err)
	resp1.Body.Close()
	assert.Equal(t, http.StatusOK, resp1.StatusCode)

	// Second delivery with same mid.
	req2, _ := http.NewRequest(http.MethodPost, srv.URL+"/webhook", bytes.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("X-Hub-Signature-256", sig)
	resp2, err := http.DefaultClient.Do(req2)
	require.NoError(t, err)
	resp2.Body.Close()
	assert.Equal(t, http.StatusOK, resp2.StatusCode)

	// Assert only one message row.
	var msgCount int
	err = d.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM facebook.messages WHERE id = $1`, "mid.456").Scan(&msgCount)
	require.NoError(t, err)
	assert.Equal(t, 1, msgCount, "duplicate webhook should be idempotent")
}

func TestWebhook_ReceivePOST_InvalidSignature(t *testing.T) {
	srv, _ := newTestServer(t, nil)
	body := []byte(`{"object":"page","entry":[]}`)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Hub-Signature-256", "sha256=bad signature")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}
