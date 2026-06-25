/**
 * useBrainOverview — aggregated Brain dashboard stats with 30s polling.
 *
 * Reuses the abort-on-refresh pattern from useBrainFeed. Polling is on
 * a fixed interval; each tick cancels the previous in-flight request.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBrainOverview } from '../lib/api/brain';
import type { BrainOverview } from '../lib/types/brain';

export interface UseBrainOverviewOptions {
  pollIntervalMs?: number; // default 30000
  enabled?: boolean; // default true
}

export function useBrainOverview(opts: UseBrainOverviewOptions = {}) {
  const { pollIntervalMs = 30000, enabled = true } = opts;
  const [data, setData] = useState<BrainOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    try {
      const res = await fetchBrainOverview(ctl.signal);
      if (ctl.signal.aborted) return;
      setData(res);
      setError(null);
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      return;
    }
    reload();
    if (pollIntervalMs > 0) {
      const id = setInterval(reload, pollIntervalMs);
      return () => {
        clearInterval(id);
        abortRef.current?.abort();
      };
    }
    return () => abortRef.current?.abort();
  }, [enabled, pollIntervalMs, reload]);

  return { data, loading, error, reload };
}
