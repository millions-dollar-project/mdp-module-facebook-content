import { fbFetch } from '../lib/api';
import { useFacebookApi } from './useFacebookApi';
import type { RepostCampaign, RepostJob, FBAccount, FBGroup, CrawledPostReal } from '../lib/types';

export const useRepostCampaigns = () =>
  useFacebookApi<RepostCampaign[]>('repost-campaigns', []);

export const useRepostJobs = (campaignId: string | null) =>
  useFacebookApi<RepostJob[]>(
    campaignId ? `repost-campaigns/${campaignId}/jobs` : null,
    []
  );

export const useFBAccounts = () =>
  useFacebookApi<FBAccount[]>('fb-accounts', []);

export const useFBGroups = () =>
  useFacebookApi<FBGroup[]>('fb-groups', []);

export const useCrawledPostsReal = (pageId: string | null) =>
  useFacebookApi<CrawledPostReal[]>(
    pageId ? `crawled-posts?pageId=${encodeURIComponent(pageId)}` : null,
    []
  );

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

export async function createAccount(payload: {
  name: string;
  profilePath: string;
  email?: string;
  /** Optional. When provided the sidecar fills the password field
   *  and submits the Facebook login form. The password is forwarded
   *  to the sidecar over the local network and never persisted. */
  password?: string;
}): Promise<{ account?: FBAccount; sessionId?: string; loginStatus?: string; loginErr?: string }> {
  return fbFetch('fb-accounts', {
    method: 'POST',
    body: payload,
  });
}

export async function pollAccountLoginStatus(sessionId: string): Promise<{
  status: string;
  lastError?: string;
}> {
  return fbFetch(`fb-accounts/login-status?sessionId=${encodeURIComponent(sessionId)}`);
}

export async function relaunchAccountLogin(
  accountId: string,
  payload: { email?: string } = {}
): Promise<{ sessionId?: string; loginStatus?: string }> {
  return fbFetch(`fb-accounts/${accountId}/login`, {
    method: 'POST',
    body: payload,
  });
}

/**
 * Delete a FB account row from the database.
 *
 * NOTE: this does NOT touch the Playwright profile directory on disk
 * (e.g. ~/.mdp/facebook/profiles/account-<ts>). The user has to
 * remove that themselves if they want to reclaim disk space — the
 * directory may contain session cookies they want to keep.
 */
export async function deleteFBAccount(id: string): Promise<{ success: boolean; id: string }> {
  return fbFetch<{ success: boolean; id: string }>('delete-fb-account', {
    method: 'POST',
    body: { id },
  });
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
 * the numeric group ID and (best-effort) display name, and creates
 * the row in one round-trip. The user can override the auto-detected
 * name by passing `name` explicitly.
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
