/**
 * useBrainProvenance — feed + drafts + provenance lookup for the peek drawer.
 *
 * Skips fetching when `feedId` is empty (drawer closed).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBrainProvenance } from '../lib/api/brain';
import type { BrainProvenanceDetail } from '../lib/types/brain';

export function useBrainProvenance(feedId: string) {
  const [data, setData] = useState<BrainProvenanceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!feedId) {
      setData(null);
      return;
    }
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    try {
      const res = await fetchBrainProvenance(feedId, ctl.signal);
      if (ctl.signal.aborted) return;
      setData(res);
      setError(null);
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, [feedId]);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  return { data, loading, error, reload };
}
