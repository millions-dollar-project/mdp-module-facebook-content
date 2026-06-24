/**
 * useBrainGenerate — POST feed ids to the Brain draft generator.
 *
 * Returns drafts + per-feed failures. Re-throws network/transport errors
 * so callers can show a banner; the API's partial-failure `failures[]`
 * is surfaced via `result` and does NOT throw.
 */
import { useCallback, useState } from 'react';
import { generateDrafts } from '../lib/api/brain';
import type { GenerateRequest, GenerateResponse } from '../lib/types/brain';

export function useBrainGenerate() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (req: GenerateRequest) => {
    setLoading(true);
    setError(null);
    try {
      const r = await generateDrafts(req);
      setResult(r);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, result, error };
}