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