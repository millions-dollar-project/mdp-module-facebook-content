/**
 * useBrainAIModels — list AI models exposed by `GET /brain/ai-models`.
 *
 * Unlike personas, models are not per-account scoped by the backend
 * (they're global operator configuration). The `accountId` param is
 * accepted but unused, mirroring the API client signature so callers
 * can swap personas ↔ ai-models without changing call sites.
 *
 * No polling. `reload()` is exposed for manual refresh after the
 * user edits `MDP_BRAIN_AI_MODELS` and restarts the backend.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBrainAIModels } from '../lib/api/brain';
import type { BrainAIModel } from '../lib/types/brain';

export interface UseBrainAIModelsOptions {
  /** Reserved for future per-account overrides; ignored today. */
  accountId?: string;
}

export function useBrainAIModels(opts: UseBrainAIModelsOptions = {}) {
  const { accountId } = opts;
  const [models, setModels] = useState<BrainAIModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    try {
      const res = (await fetchBrainAIModels(ctl.signal, accountId)) as unknown;
      if (ctl.signal.aborted) return;
      // The Go backend historically returns the list under a few
      // different keys (`data`, `models`, or a bare array). Treat any
      // non-array as empty so the consumer's `.map()` never crashes
      // on undefined — Phase 4 defensive guard from a real
      // "Cannot read properties of undefined (reading 'map')" in
      // SchedulePostModal:88 (useMemo over `models`).
      const raw = res as { data?: unknown; models?: unknown } | unknown[];
      const list: BrainAIModel[] = Array.isArray((raw as { data?: unknown }).data)
        ? (raw as { data: BrainAIModel[] }).data
        : Array.isArray((raw as { models?: unknown }).models)
          ? (raw as { models: BrainAIModel[] }).models
          : Array.isArray(raw)
            ? (raw as unknown as BrainAIModel[])
            : [];
      setModels(list);
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

  return { models, loading, error, reload };
}
