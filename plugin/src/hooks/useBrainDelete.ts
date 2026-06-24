/**
 * useBrainDelete — DELETE a Brain feed item by id.
 *
 * Pure mutation hook — no read state. Caller is expected to refresh
 * the list (via useBrainFeed.reload) after a successful delete.
 */
import { useCallback, useState } from 'react';
import { deleteBrainFeed } from '../lib/api/brain';

export function useBrainDelete() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteBrainFeed(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { remove, loading, error };
}