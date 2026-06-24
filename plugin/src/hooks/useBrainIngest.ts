/**
 * useBrainIngest — POST crawled posts to the Brain ingest endpoint.
 *
 * Tracks loading/error/result state and re-throws errors so callers can
 * await the promise and react to failures (e.g. show a toast).
 */
import { useCallback, useState } from 'react';
import { ingestPosts } from '../lib/api/brain';
import type { IngestPostsRequest, IngestResponse } from '../lib/types/brain';

export function useBrainIngest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ingest = useCallback(async (req: IngestPostsRequest) => {
    setLoading(true);
    setError(null);
    try {
      const r = await ingestPosts(req);
      setResult(r);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { ingest, loading, result, error };
}