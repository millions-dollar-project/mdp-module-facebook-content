/**
 * useCrawlerSources — fetch the list of mdp-crawler source YAMLs and
 * the current CDP browser launch status.
 *
 * Used by the Crawl tab to render the "Tài khoản của tôi" picker and
 * the prerequisite warning panel. Polls on a 30s interval so the
 * warning state stays in sync with the user's CDP browser (start
 * Chrome → warning clears without a manual refresh).
 *
 * Both fetches tolerate the mdp-crawler service being down: a
 * network error becomes `error: string` and `sources: []` so the UI
 * can show "mdp-crawler chưa chạy" instead of crashing.
 */
import { useEffect, useState, useCallback } from 'react';
import { crawlerFetch, type CrawlerSource, type LaunchStatus } from '../lib/crawlerApi';

const POLL_MS = 30_000;

export interface UseCrawlerSourcesResult {
  sources: CrawlerSource[];
  launch: LaunchStatus | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useCrawlerSources(): UseCrawlerSourcesResult {
  const [sources, setSources] = useState<CrawlerSource[]>([]);
  const [launch, setLaunch] = useState<LaunchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      crawlerFetch<CrawlerSource[]>('/api/sources').catch((e) => {
        throw new Error(`/api/sources: ${(e as Error).message}`);
      }),
      crawlerFetch<LaunchStatus>('/api/launch/status').catch(() => ({} as LaunchStatus)),
    ])
      .then(([src, lch]) => {
        if (cancelled) return;
        setSources(Array.isArray(src) ? src : []);
        setLaunch(lch ?? null);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
        setSources([]);
        setLaunch(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Fast retry right after a failure: the 30s poll is too slow if the
  // user starts mdp-crawler after opening the tab. Re-poll on a short
  // ladder while there's an error, then fall back to the long interval
  // once we successfully read sources at least once.
  useEffect(() => {
    if (!error) return;
    const delays = [2_000, 5_000, 10_000];
    const timers = delays.map((d) => window.setTimeout(() => setTick((t) => t + 1), d));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [error]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { sources, launch, loading, error, reload };
}
