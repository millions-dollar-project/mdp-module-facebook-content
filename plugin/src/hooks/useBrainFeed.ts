/**
 * useBrainFeed — read paginated Brain feed items with abort-on-filter-change.
 *
 * The hook owns an AbortController so each filter change (page, status,
 * search, etc.) cancels the in-flight request before starting a new one.
 * `reload()` returns the promise callers can await for manual refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { listBrainFeed } from '../lib/api/brain';
import type { BrainFeedListResponse, BrainFeedItem } from '../lib/types/brain';

export interface UseBrainFeedParams {
  page: number;
  pageSize?: number;
  sourcePage?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
}

export function useBrainFeed(params: UseBrainFeedParams) {
  const [data, setData] = useState<BrainFeedListResponse>({
    items: [],
    total: 0,
    page: 1,
    pageSize: params.pageSize ?? 20,
  });
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
      const res = await listBrainFeed({ ...params, signal: ctl.signal });
      if (ctl.signal.aborted) return;
      setData(res);
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, [params.page, params.pageSize, params.sourcePage, params.status, params.from, params.to, params.search]);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  return { data, loading, error, reload };
}

export type { BrainFeedItem };