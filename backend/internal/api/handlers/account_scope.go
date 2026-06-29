package handlers

// Account-scope helper for per-request Brain scoping.
//
// mdp-brain scopes its queries via flat JSON-RPC arguments (e.g.
// `user_id`, `profile_id`, `account_id`). Each scope-aware handler
// here historically received its scope as a constructor argument
// (frozen at server start). To support multi-account dashboards
// without restarting the process, handlers now derive a per-request
// scope from the `?account_id=` query string.
//
// The wire key is `account_id` (matches `mcp.Scope.AccountID`'s
// `json:"account_id"` tag) — distinct from `user_id` because the
// account is a kit-account identity, not a user-of-app identity.
// When `accountID` is empty the caller's scope is returned unchanged,
// so existing clients that don't pass the param keep their old
// behavior.

// withAccountScope returns a copy of `base` with `account_id`
// overridden by `accountID`. The input map is never mutated. If
// `accountID` is empty the same map is returned (cheap path for
// callers that don't forward per-request scoping).
func withAccountScope(base map[string]string, accountID string) map[string]string {
	if accountID == "" {
		return base
	}
	out := make(map[string]string, len(base)+1)
	for k, v := range base {
		out[k] = v
	}
	out["account_id"] = accountID
	return out
}
