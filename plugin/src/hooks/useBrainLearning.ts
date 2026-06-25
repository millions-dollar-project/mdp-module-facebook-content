/**
 * useBrainLearning — proposed learning signals with manual reload.
 *
 * Signals accumulate from feedback events; the dashboard refreshes on
 * demand (e.g. after recording feedback). No auto-polling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBrainLearning } from '../lib/api/brain';
import type { BrainLearningSignal } from '../lib/types/brain';

export function useBrainLearning() {
  const [signals, setSignals] = useState<BrainLearningSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    try {
      const res = await fetchBrainLearning(ctl.signal);
      if (ctl.signal.aborted) return;
      setSignals(res.signals);
      setError(null);
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  return { signals, loading, error, reload };
}
