/**
 * API client for the Crawl → Brain → Schedule flow.
 *
 * Three endpoints do the heavy lifting:
 *
 *  - POST /brain/generate-and-schedule: takes numDrafts + an AI model id +
 *    N custom time slots; the backend pulls the top-N newest crawled
 *    feeds from brain_feeds as style context, runs mdp-brain.Generate
 *    on them, picks the first numDrafts drafts, and inserts N
 *    scheduled_posts rows (post_type='personal') bound to each draft
 *    via kanban_job_id. The user picks the slot times freely — no
 *    auto-spacing.
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
  /** AI model id used to produce the draft (e.g. "gpt-4o"). */
  modelId?: string;
  feedContent?: string;
  thumbnail?: string;
  feedMediaUrls?: string[];
}

export interface GenerateAndScheduleRequest {
  /**
   * Number of NEW drafts to produce. The handler pulls the top
   * numDrafts newest feeds from brain_feeds as style context for
   * the AI, but the OUTPUT is exactly numDrafts scheduled posts.
   * Range: 1..50.
   */
  numDrafts: number;
  /** AI model id (one of GET /brain/ai-models). Backend uses this to choose the provider. */
  modelId: string;
  /** SHA-1 v5 UUID of the kit account that owns the personal /me posts. */
  accountId: string;
  /**
   * One custom scheduled time per draft. Times are fully free-form
   * (no auto-spacing) — the user might pick 10:01, 10:02, 14:30 on
   * the same day. Length MUST equal numDrafts.
   */
  slots: { scheduledAt: string /* ISO 8601 */ }[];
}

export interface GenerateAndScheduleResponse {
  drafts: { feedId: string; draftId: string; status: string }[];
  schedules: {
    scheduledPostId: string;
    scheduledAt: string;
  }[];
  /**
   * Per-slot failures. The `index` field is the 0-based position
   * in the request's slots array so the UI can show "slot #3 failed"
   * to the user.
   */
  failures: {
    index: number;
    stage: 'draft' | 'schedule';
    message: string;
  }[];
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
  /**
   * Generate numDrafts AI drafts from the user's crawled feeds and
   * schedule each one at a custom time for /me (personal profile)
   * publishing. The number of slots passed MUST equal numDrafts.
   */
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