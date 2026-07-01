import { useEffect, useState, useCallback } from 'react';
import { fbFetch } from '../lib/api';
import { useFacebookApi } from './useFacebookApi';
import type { RepostCampaign, RepostJob, FBAccount, FBGroup, CrawledPostReal } from '../lib/types';
import { accountUUIDFromName } from '../lib/accountUUID';

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: kit-accounts is the source of truth for FB accounts (replaces the
// old SQL `facebook.fb_accounts` table). The plugin routes everything through
// the shared handler mounted at /api/v1/facebook/kit-accounts (mdp-kit/go/
// kit-accounts). All FB-specific fields below are mapped from the kit Summary
// envelope so the UI keeps working without changes.
// ─────────────────────────────────────────────────────────────────────────────

/** Raw shape returned by GET /kit-accounts → { accounts: [...] } */
interface KitAccountSummaryRaw {
  name: string;
  platform?: string;
  status?: string;
  healthStatus?: string;
  lastUsedAt?: string;
  // Backwards-compat: legacy rows may carry a pre-existing UUID `id`.
  id?: string;
  profilePath?: string;
  createdAt?: string;
}

/** Normalize a kit Summary into the FBAccount shape the UI expects. */
const toFBAccount = (raw: KitAccountSummaryRaw): FBAccount => ({
  // Use kit's `name` as the identity field. Legacy code used `id` as the
  // primary key; here we set `id = name` so consumers that read `account.id`
  // (e.g. dropdowns) keep working without a rewrite.
  id: raw.id ?? raw.name,
  name: raw.name,
  // SHA-1 v5 UUID derived from the kit-account name. This is the same
  // identifier the Go backend uses for kit-account scoping (see
  // service.AccountUUIDFromName); the dropdown in the Brain tab forwards
  // this UUID to the dashboard endpoints via ?account_id=.
  uuid: accountUUIDFromName(raw.name),
  profilePath: raw.profilePath ?? `~/.mdp/facebook/profiles/${raw.name}`,
  status: raw.status ?? 'active',
  lastUsedAt: raw.lastUsedAt ?? undefined,
  createdAt: raw.createdAt ?? '',
});

// ─── Read hooks ─────────────────────────────────────────────────────────────

export const useRepostCampaigns = () =>
  useFacebookApi<RepostCampaign[]>('repost-campaigns', []);

export const useRepostJobs = (campaignId: string | null) =>
  useFacebookApi<RepostJob[]>(
    campaignId ? `repost-campaigns/${campaignId}/jobs` : null,
    []
  );

/**
 * List FB accounts backed by kit-accounts. Returns the legacy `{ data }`
 * envelope the rest of the plugin already consumes.
 */
export function useFBAccounts(): {
  data: FBAccount[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<FBAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fbFetch<{ accounts?: KitAccountSummaryRaw[] } | KitAccountSummaryRaw[]>(
      'kit-accounts',
      { preferIpc: true }
    )
      .then((res) => {
        if (cancelled) return;
        // The kit handler returns { accounts: [...] }; tolerate a bare
        // array too in case the route is reshaped later.
        const list = Array.isArray(res) ? res : res?.accounts ?? [];
        setData(list.map(toFBAccount));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { data, loading, error, reload };
}

export const useFBGroups = () =>
  useFacebookApi<FBGroup[]>('fb-groups', []);

export const useCrawledPostsReal = (pageId: string | null) =>
  useFacebookApi<CrawledPostReal[]>(
    pageId ? `crawled-posts?pageId=${encodeURIComponent(pageId)}` : null,
    []
  );

// ─── Mutating helpers (delegated to kit-accounts sidecar flow) ──────────────

export interface CreateAccountPayload {
  name: string;
  /** Display profile path; kit-accounts derives a default when omitted. */
  profilePath?: string;
  email?: string;
  /** Forwarded to the sidecar — never persisted. */
  password?: string;
  /** JSON cookie array — paste from extension to skip login. */
  cookiesJson?: string;
  /** Optional platform override (defaults to "facebook"). */
  platform?: string;
}

interface KitLoginStartResponse {
  sessionId?: string;
  loginStatus?: string;
  loginErr?: string;
  account?: { name: string };
}

export async function createCampaign(payload: {
  name: string;
  sourcePostUrl: string;
  sourcePostText: string;
  mediaUrls?: string[];
  captionStyle?: string;
  scheduledAt: string;
}): Promise<RepostCampaign> {
  return fbFetch<RepostCampaign>('repost-campaigns', {
    method: 'POST',
    body: payload,
  });
}

export async function runCampaign(id: string): Promise<{ success: boolean }> {
  return fbFetch<{ success: boolean }>(`repost-campaigns/${id}/run`, {
    method: 'POST',
  });
}

/**
 * Phase 2: route through kit-accounts sidecar login/start. The kit handler
 * at /kit-accounts/login/start forwards verbatim to the Node sidecar's
 * /account-login/start (mounted on :9001 by default) and returns the
 * Playwright sessionId for polling.
 */
export async function createAccount(payload: CreateAccountPayload): Promise<{
  account?: FBAccount;
  sessionId?: string;
  loginStatus?: string;
  loginErr?: string;
}> {
  // The kit handler proxies the request body verbatim to the sidecar;
  // including `name` here is what lets the sidecar persist the kit
  // artifacts under ~/mdp-data/accounts/<name>/ once the user signs in.
  const body = {
    name: payload.name,
    profilePath: payload.profilePath ?? `~/.mdp/facebook/profiles/${payload.name}`,
    email: payload.email,
    password: payload.password,
    cookiesJson: payload.cookiesJson,
  };
  const res = await fbFetch<KitLoginStartResponse>(
    `kit-accounts/login/start?name=${encodeURIComponent(payload.name)}`,
    { method: 'POST', body }
  );
  return {
    account: res.account
      ? {
          id: res.account.name,
          name: res.account.name,
          profilePath: body.profilePath,
          status: 'pending',
        }
      : undefined,
    sessionId: res.sessionId,
    loginStatus: res.loginStatus,
    loginErr: res.loginErr,
  };
}

/** Poll the sidecar login session; mirrors the legacy `login-status` shape. */
export async function pollAccountLoginStatus(sessionId: string): Promise<{
  status: string;
  lastError?: string;
}> {
  return fbFetch<{ status: string; lastError?: string }>(
    `kit-accounts/login/status?sessionId=${encodeURIComponent(sessionId)}`
  );
}

/**
 * Force a sidecar persist for a completed login session. The sidecar
 * also auto-persists inside its `_runLoginFlow`, but that auto-persist
 * can race with the status flip ("completed") or fail silently. Calling
 * this after the plugin sees `status=completed` makes the on-disk
 * meta.json + appstate.json pair authoritative — the UI can then
 * reloadAccounts and see the new row even if the auto-persist lagged.
 *
 * Mirrors `kit-accounts/login/persist` → sidecar `/account-login/persist`.
 */
export async function persistAccountLogin(
  sessionId: string,
  name: string,
): Promise<{ persisted: boolean; path?: string }> {
  return fbFetch<{ persisted: boolean; path?: string }>(
    `kit-accounts/login/persist`,
    {
      method: 'POST',
      body: { sessionId, name },
    },
  );
}

/**
 * Relaunch a fresh login session for an existing account (used after
 * `appstate.json` expiry). Hits the kit-accounts sidecar start endpoint
 * again — the kit handler will overwrite or create the sessionId.
 */
export async function relaunchAccountLogin(
  accountId: string,
  payload: { email?: string } = {}
): Promise<{ sessionId?: string; loginStatus?: string }> {
  return fbFetch<{ sessionId?: string; loginStatus?: string }>(
    `kit-accounts/login/start?name=${encodeURIComponent(accountId)}`,
    { method: 'POST', body: payload }
  );
}

/**
 * Delete a FB account via kit-accounts. The handler triggers
 * OnDeleteCascade (clears `fb_groups.assigned_account_id` in SQL) before
 * removing the on-disk folder, so the UI's confirm dialog can safely
 * delete + close without manual cleanup.
 */
export async function deleteFBAccount(id: string): Promise<{
  success: boolean;
  id: string;
}> {
  await fbFetch<{ name: string; deleted: boolean }>(
    `kit-accounts/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  return { success: true, id };
}

/**
 * Delete a FB group row by id. Note that `repost_jobs.group_id` is a
 * plain TEXT column with no FK, so any existing jobs referencing the
 * deleted group will keep the stale group_id text and may fail at
 * runtime. The plugin surfaces a warning in the confirm dialog.
 */
export async function deleteFBGroup(id: string): Promise<{ success: boolean; id: string }> {
  return fbFetch<{ success: boolean; id: string }>('delete-fb-group', {
    method: 'POST',
    body: { id },
  });
}

/**
 * Delete a repost campaign (and its jobs) by id.
 */
export async function deleteRepostCampaign(id: string): Promise<{ success: boolean; id: string }> {
  return fbFetch<{ success: boolean; id: string }>('delete-repost-campaign', {
    method: 'POST',
    body: { id },
  });
}

export async function createGroup(payload: {
  groupId: string;
  name?: string;
  assignedAccountId?: string;
}): Promise<FBGroup> {
  return fbFetch<FBGroup>('fb-groups', {
    method: 'POST',
    body: payload,
  });
}

/**
 * Paste-a-link flow. The user types a Facebook group URL (any shape
 * — www/m/bare/with-permalink) and the backend parses it, extracts
 * the numeric group ID and (best-effort) display name, and creates the
 * row in one round-trip. The user can override the auto-detected name
 * by passing `name` explicitly.
 */
export async function createGroupFromUrl(payload: {
  url: string;
  name?: string;
  assignedAccountId?: string;
}): Promise<FBGroup> {
  return fbFetch<FBGroup>('fb-groups/from-url', {
    method: 'POST',
    body: payload,
  });
}

export async function crawlPage(payload: {
  pageUrl: string;
  pageId: string;
  limit?: number;
}): Promise<CrawledPostReal[]> {
  return fbFetch<CrawledPostReal[]>('crawl', {
    method: 'POST',
    body: payload,
  });
}

export async function generateKlingImages(payload: {
  prompt: string;
  count?: number;
  options?: Record<string, string>;
}): Promise<{ paths: string[] }> {
  return fbFetch<{ paths: string[] }>('kling/images', {
    method: 'POST',
    body: payload,
  });
}

export async function generateKlingVideos(payload: {
  prompt: string;
  count?: number;
  options?: Record<string, string>;
}): Promise<{ paths: string[] }> {
  return fbFetch<{ paths: string[] }>('kling/videos', {
    method: 'POST',
    body: payload,
  });
}

/**
 * Re-export the kit-accounts admin helpers so plugin code can manage
 * accounts without round-tripping through the useFBAccounts hook (used
 * for the touch-last-used call after a successful crawl, etc.).
 */
export async function touchFBAccount(name: string): Promise<void> {
  await fbFetch(`kit-accounts/${encodeURIComponent(name)}/last-used`, {
    method: 'PATCH',
  });
}