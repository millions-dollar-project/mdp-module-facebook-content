/**
 * useBrainPersonas — list AI profiles known to the Brain MCP.
 *
 * No polling — personas change rarely. `reload()` is exposed for manual
 * refresh after a sync event.
 *
 * accountId is the SHA-1 v5 UUID of a kit account (forwarded as
 * ?account_id=). When omitted the backend keeps its default scope.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBrainPersonas } from '../lib/api/brain';
import type { BrainPersona } from '../lib/types/brain';

export interface UseBrainPersonasOptions {
  /** Per-account scope override (SHA-1 v5 UUID). */
  accountId?: string;
}

export function useBrainPersonas(opts: UseBrainPersonasOptions = {}) {
  const { accountId } = opts;
  const [personas, setPersonas] = useState<BrainPersona[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    try {
      const res = await fetchBrainPersonas(ctl.signal, accountId);
      if (ctl.signal.aborted) return;
      setPersonas(res.personas);
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

  return { personas, loading, error, reload };
}
