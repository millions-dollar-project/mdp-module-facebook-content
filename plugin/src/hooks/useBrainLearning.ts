/**
 * useBrainLearning — proposed learning signals with manual reload.
 *
 * Signals accumulate from feedback events; the dashboard refreshes on
 * demand (e.g. after recording feedback). No auto-polling.
 *
 * accountId is the SHA-1 v5 UUID of a kit account (forwarded as
 * ?account_id=). When omitted the backend keeps its default scope.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBrainLearning } from '../lib/api/brain';
import type { BrainLearningSignal } from '../lib/types/brain';

export interface UseBrainLearningOptions {
  /** Per-account scope override (SHA-1 v5 UUID). */
  accountId?: string;
}

export function useBrainLearning(opts: UseBrainLearningOptions = {}) {
  const { accountId } = opts;
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
      const res = await fetchBrainLearning(ctl.signal, accountId);
      if (ctl.signal.aborted) return;
      setSignals(res.signals);
      setError(null);
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  return { signals, loading, error, reload };
}
