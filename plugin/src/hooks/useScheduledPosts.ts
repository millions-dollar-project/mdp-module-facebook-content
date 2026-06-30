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
      const res = await scheduleApi.list(query);
      if (ctl.signal.aborted) return;
      setRows(res.data);
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