/**
 * useBrainIngest — POST crawled posts to the Brain ingest endpoint.
 *
 * Tracks loading/error/result state and re-throws errors so callers can
 * await the promise and react to failures (e.g. show a toast).
 */
import { useCallback, useState } from 'react';
import { ingestPosts, type IngestPostsParams } from '../lib/api/brain';
import type { IngestPostsRequest, IngestResponse } from '../lib/types/brain';

export function useBrainIngest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Ingest crawled posts. `accountId` is the SHA-1 v5 UUID of the
   * currently-selected kit account (see `accountUUIDFromName`). When
   * set, the backend stamps it onto every post in the batch so the
   * resulting brain_feed rows and brain MCP ingest both carry the
   * kit account identity. Pass `''` (default) to keep the legacy
   * "default" scope.
   */
  const ingest = useCallback(async (params: { req: IngestPostsRequest; accountId?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const r = await ingestPosts(params satisfies IngestPostsParams);
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
