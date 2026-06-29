/**
 * API client for the Brain feed endpoints.
 *
 * All calls go through `fbFetch` (see `../api.ts`) which prefers the mdp-shell
 * IPC bridge and falls back to direct HTTP when the shell is unavailable
 * (dev mode, tests, etc).
 */

import { fbFetch } from '../api';
import type {
  BrainFeedListResponse,
  BrainGraphStats,
  BrainLearningSignal,
  BrainOverview,
  BrainPersona,
  BrainProvenanceDetail,
  GenerateRequest,
  GenerateResponse,
  IngestPostsRequest,
  IngestResponse,
} from '../types/brain';

export interface ListBrainFeedParams {
  page: number;
  pageSize?: number;
  sourcePage?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  /**
   * Per-account scope override (SHA-1 v5 UUID of kit-account name).
   * When set, the backend filters brain_feed rows to only those ingested
   * under this account. Empty (default) keeps the no-filter behavior
   * that the dashboard had before multi-account scoping.
   */
  accountId?: string;
  signal?: AbortSignal;
}

export function listBrainFeed(params: ListBrainFeedParams): Promise<BrainFeedListResponse> {
  const q = new URLSearchParams();
  q.set('page', String(params.page));
  if (params.pageSize !== undefined) q.set('page_size', String(params.pageSize));
  if (params.sourcePage) q.set('source_page', params.sourcePage);
  if (params.status) q.set('status', params.status);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.search) q.set('search', params.search);
  if (params.accountId) q.set('account_id', params.accountId);
  return fbFetch<BrainFeedListResponse>(`brain/feed?${q.toString()}`, {
    signal: params.signal,
  });
}

export function deleteBrainFeed(id: string): Promise<{ deleted: boolean }> {
  return fbFetch<{ deleted: boolean }>(
    `brain/feed/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

export function ingestPosts(req: IngestPostsRequest): Promise<IngestResponse> {
  return fbFetch<IngestResponse>('brain/ingest', {
    method: 'POST',
    body: req,
  });
}

export function generateDrafts(req: GenerateRequest): Promise<GenerateResponse> {
  return fbFetch<GenerateResponse>('brain/generate', {
    method: 'POST',
    body: req,
  });
}

// ── Dashboard (T6) ──────────────────────────────────────────────────

/**
 * Build a `?account_id=<uuid>` suffix when an accountId is provided.
 * Returns '' when not set, so callers can simply concatenate:
 *   fetchBrainOverview(signal)        → `brain/overview`
 *   fetchBrainOverview(signal, 'abc') → `brain/overview?account_id=abc`
 */
function accountIdQuery(accountId?: string): string {
  return accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
}

export function fetchBrainOverview(signal?: AbortSignal, accountId?: string): Promise<BrainOverview> {
  return fbFetch<BrainOverview>(`brain/overview${accountIdQuery(accountId)}`, { signal });
}

export function fetchBrainProvenance(
  feedId: string,
  signal?: AbortSignal,
): Promise<BrainProvenanceDetail> {
  return fbFetch<BrainProvenanceDetail>(
    `brain/provenance/${encodeURIComponent(feedId)}`,
    { signal },
  );
}

export function fetchBrainPersonas(signal?: AbortSignal, accountId?: string): Promise<{ personas: BrainPersona[] }> {
  return fbFetch<{ personas: BrainPersona[] }>(`brain/personas${accountIdQuery(accountId)}`, { signal });
}

export function fetchBrainLearning(signal?: AbortSignal, accountId?: string): Promise<{ signals: BrainLearningSignal[] }> {
  return fbFetch<{ signals: BrainLearningSignal[] }>(`brain/learning${accountIdQuery(accountId)}`, { signal });
}

export function applyBrainLearning(
  signalId: string,
): Promise<{ applied: boolean; signal_id: string; note?: string }> {
  return fbFetch<{ applied: boolean; signal_id: string; note?: string }>(
    `brain/learning/${encodeURIComponent(signalId)}/apply`,
    { method: 'POST' },
  );
}

export function recordBrainFeedback(
  provenanceId: string,
  action: 'approved' | 'rejected' | 'edited',
  opts: { editedText?: string; notes?: string; reasonTags?: string[] } = {},
): Promise<{ feedback_id: string; signal_created: boolean }> {
  return fbFetch<{ feedback_id: string; signal_created: boolean }>('brain/feedback', {
    method: 'POST',
    body: {
      provenance_id: provenanceId,
      action,
      edited_text: opts.editedText,
      notes: opts.notes,
      reason_tags: opts.reasonTags,
    },
  });
}

export function fetchBrainGraphStats(signal?: AbortSignal, accountId?: string): Promise<BrainGraphStats> {
  return fbFetch<BrainGraphStats>(`brain/graph/stats${accountIdQuery(accountId)}`, { signal });
}