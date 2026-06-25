/**
 * useBrainPersonas — list AI profiles known to the Brain MCP.
 *
 * No polling — personas change rarely. `reload()` is exposed for manual
 * refresh after a sync event.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBrainPersonas } from '../lib/api/brain';
import type { BrainPersona } from '../lib/types/brain';

export function useBrainPersonas() {
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
      const res = await fetchBrainPersonas(ctl.signal);
      if (ctl.signal.aborted) return;
      setPersonas(res.personas);
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

  return { personas, loading, error, reload };
}
