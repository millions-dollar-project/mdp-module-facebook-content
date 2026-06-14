// Package handlers contains the thin HTTP→service adapters. Each file
// owns one resource; routes are registered in package api/router.go.
package handlers

import (
	"encoding/json"
	"net/http"
)

// ErrorBody is the consistent error envelope. Code is a short stable
// identifier (e.g. "invalid_input", "not_found", "internal"), Message
// is human-readable, RequestID helps the user file a bug.
type ErrorBody struct {
	Error     string `json:"error"`
	Code      string `json:"code"`
	RequestID string `json:"requestId,omitempty"`
}

// idOnlyReq is a {id: "..."} body used by endpoints that take a single
// resource id. Kept here so queue.go and scheduler.go can share it.
type idOnlyReq struct {
	ID string `json:"id"`
}

// WriteError serialises err as JSON with the given status. If err is
// non-nil, it appears in the body; if nil, the body is just the code.
func WriteError(w http.ResponseWriter, r *http.Request, status int, code, msg string, rid string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorBody{Error: msg, Code: code, RequestID: rid})
}

// WriteJSON encodes v as JSON. 204 is handled as "no body".
func WriteJSON(w http.ResponseWriter, status int, v any) error {
	if v == nil {
		w.WriteHeader(status)
		return nil
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(v)
}
