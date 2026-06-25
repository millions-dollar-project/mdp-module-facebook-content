/**
 * useBrainGraph — aggregate counts over the Brain entity graph.
 *
 * Polled alongside the overview (default 30s) so the graph panel
 * stays in sync with the rest of the dashboard.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBrainGraphStats } from '../lib/api/brain';
import type { BrainGraphStats } from '../lib/types/brain';

export interface UseBrainGraphOptions {
  pollIntervalMs?: number; // default 30000
  enabled?: boolean; // default true
}

export function useBrainGraph(opts: UseBrainGraphOptions = {}) {
  const { pollIntervalMs = 30000, enabled = true } = opts;
  const [data, setData] = useState<BrainGraphStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    try {
      const res = await fetchBrainGraphStats(ctl.signal);
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
