/**
 * useScheduledPosts — read scheduled_posts rows for the Kanban tab.
 *
 * The Kanban shows three columns (scheduled / publishing / published-failed)
 * so the hook fetches with `status=SCHEDULED,PUBLISHING,FAILED,PUBLISHED`
 * and the Kanban groups client-side. `reload()` is what the action
 * buttons (Đăng ngay / Chỉnh giờ / Hủy) call after each mutation.
 *
 * accountId is the SHA-1 v5 UUID of the kit account. Empty = all rows.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  scheduleApi,
  type ScheduleRow,
  type ListScheduledParams,
} from '../lib/api/scheduled';

export interface UseScheduledPostsParams {
  /** Comma-separated list of statuses to include. Empty = all. */
  status?: string;
  /** SHA-1 v5 UUID of the kit account. Empty = all. */
  accountId?: string;
  limit?: number;
}

const DEFAULT_STATUSES = 'SCHEDULED,PUBLISHING,PUBLISHED,FAILED,CANCELLED';

export function useScheduledPosts(params: UseScheduledPostsParams) {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    setError(null);
    try {
      const query: ListScheduledParams = {
        status: params.status ?? DEFAULT_STATUSES,
        accountId: params.accountId,
        limit: params.limit ?? 100,
      };
      const res = (await scheduleApi.list(query)) as unknown;
      if (ctl.signal.aborted) return;
      // Same shape-tolerance as useBrainAIModels: the Go backend has
      // shipped the scheduled-posts list under a few keys (`data`,
      // `rows`, `posts`, bare array). Anything else → [] so the
      // consumer's `for (const r of rows)` (KanbanTab:144) never hits
      // "rows is not iterable".
      const raw = res as { data?: unknown; rows?: unknown; posts?: unknown } | unknown[];
      const list: ScheduleRow[] = Array.isArray((raw as { data?: unknown }).data)
        ? (raw as { data: ScheduleRow[] }).data
        : Array.isArray((raw as { rows?: unknown }).rows)
          ? (raw as { rows: ScheduleRow[] }).rows
          : Array.isArray((raw as { posts?: unknown }).posts)
            ? (raw as { posts: ScheduleRow[] }).posts
            : Array.isArray(raw)
              ? (raw as unknown as ScheduleRow[])
              : [];
      setRows(list);
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, [params.status, params.accountId, params.limit]);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  return { rows, loading, error, reload };
}