import { useCallback, useEffect, useState } from 'react';
import { fbFetch } from '../lib/api';

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseFacebookApiResult<T> {
  data: T;
  status: AsyncStatus;
  error: Error | null;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T>>;
}

export interface UseFacebookApiOptions {
  enabled?: boolean;
  fallbackOnError?: boolean;
  pollMs?: number;
}

export function useFacebookApi<T>(
  path: string | null,
  fallback: T,
  options: UseFacebookApiOptions = {}
): UseFacebookApiResult<T> {
  const { enabled = true, fallbackOnError = true, pollMs } = options;
  const [data, setData] = useState<T>(fallback);
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !path) {
      setData(fallback);
      setStatus('ready');
      return;
    }
    let cancelled = false;
    const fetchOnce = async (): Promise<void> => {
      setStatus('loading');
      try {
        const res = await fbFetch<T>(path);
        if (cancelled) return;
        setData(res);
        setError(null);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err as Error);
        if (fallbackOnError) {
          setData(fallback);
          setStatus('ready');
        } else {
          setStatus('error');
        }
      }
    };
    void fetchOnce();
    if (pollMs && pollMs > 0) {
      const id = window.setInterval(() => {
        void fetchOnce();
      }, pollMs);
      return () => {
        cancelled = true;
        window.clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, nonce, pollMs]);

  return { data, status, error, reload, setData };
}

export default useFacebookApi;
