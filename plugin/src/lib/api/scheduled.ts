/**
 * API client for the Crawl → Brain → Schedule flow.
 *
 * Three endpoints do the heavy lifting:
 *
 *  - POST /brain/generate-and-schedule: takes N feed ids + a persona +
 *    N time slots; the backend runs mdp-brain.Generate, inserts N
 *    scheduled_posts rows (post_type='personal'), and binds each draft
 *    row to its schedule via kanban_job_id.
 *
 *  - GET /scheduled-posts?status=…&accountId=…: enriched list for the
 *    Kanban tab (joins brain_drafts + brain_feeds).
 *
 *  - POST /publish-scheduled-now, /reschedule-scheduled-post,
 *    /cancel-schedule: per-card actions.
 *
 * The `postType` field on each row discriminates between fanpage
 * (Graph API → Publisher) and personal (Playwright /me → sidecar).
 * The Kanban uses this to label cards and to gate which publish code
 * path the backend takes.
 */

import { fbFetch } from '../api';

export type ScheduleStatus =
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED';

export type PostType =
  | 'text'
  | 'photo'
  | 'video'
  | 'link'
  | 'carousel'
  | 'reel'
  | 'personal';

export interface ScheduleRow {
  id: string;
  pageId?: string;
  /** SHA-1 v5 UUID of the kit account that owns this row. */
  kitAccountId?: string;
  content: string;
  scheduledAt: string; // ISO 8601
  status: ScheduleStatus;
  postType: PostType;
  aiGenerated: boolean;
  facebookPostId?: string;
  errorMessage?: string;
  /** Enrichment from the LEFT JOIN on brain_drafts. */
  brainDraftId?: string;
  personaId?: string;
  feedContent?: string;
  thumbnail?: string;
  feedMediaUrls?: string[];
}

export interface GenerateAndScheduleRequest {
  feedIds: string[];
  personaId: string;
  /** SHA-1 v5 UUID of the kit account that owns the personal /me posts. */
  accountId: string;
  slots: { scheduledAt: string /* ISO */ }[];
}

export interface GenerateAndScheduleResponse {
  drafts: { feedId: string; draftId: string; status: string }[];
  schedules: {
    feedId: string;
    scheduledPostId: string;
    scheduledAt: string;
  }[];
  failures: { feedId: string; stage: 'draft' | 'schedule'; message: string }[];
}

export interface ListScheduledParams {
  /** Comma-separated list (e.g. "SCHEDULED,PUBLISHING,FAILED"). Empty = all. */
  status?: string;
  /** SHA-1 v5 UUID of the kit account. Empty = all. */
  accountId?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export const scheduleApi = {
  /** Generate a draft per feed id and schedule each for /me publishing. */
  generateAndSchedule(req: GenerateAndScheduleRequest) {
    return fbFetch<GenerateAndScheduleResponse>('brain/generate-and-schedule', {
      method: 'POST',
      body: req,
    });
  },

  /** List scheduled posts, optionally filtered by status + kit account. */
  list(params: ListScheduledParams = {}) {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.accountId) q.set('accountId', params.accountId);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    const qs = q.toString();
    return fbFetch<{ data: ScheduleRow[] }>(
      `scheduled-posts${qs ? `?${qs}` : ''}`,
      { signal: params.signal }
    );
  },

  /** Manually publish a SCHEDULED row now. The Worker code path picks
   *  the right publisher (Graph API vs sidecar) based on post_type. */
  publishNow(id: string) {
    return fbFetch<{ data: ScheduleRow }>('publish-scheduled-now', {
      method: 'POST',
      body: { id },
    });
  },

  /** Move a SCHEDULED row to a new time. postType is asserted server-side. */
  reschedule(id: string, scheduledAt: string, postType: PostType) {
    return fbFetch<{ data: ScheduleRow }>('reschedule-scheduled-post', {
      method: 'POST',
      body: { id, scheduledAt, postType },
    });
  },

  /** Cancel a SCHEDULED row. */
  cancel(id: string) {
    return fbFetch<{ data: ScheduleRow }>('cancel-schedule', {
      method: 'POST',
      body: { id },
    });
  },
};