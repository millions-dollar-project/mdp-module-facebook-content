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
import { fbFetch } from '../lib/api';
import type { CrawlerSource, LaunchStatus, CrawlerBrowser } from '../lib/crawlerApi';

const POLL_MS = 30_000;

export interface UseCrawlerSourcesResult {
  sources: CrawlerSource[];
  launch: LaunchStatus | null;
  browsers: CrawlerBrowser[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useCrawlerSources(): UseCrawlerSourcesResult {
  const [sources, setSources] = useState<CrawlerSource[]>([]);
  const [launch, setLaunch] = useState<LaunchStatus | null>(null);
  const [browsers, setBrowsers] = useState<CrawlerBrowser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fbFetch<CrawlerSource[]>('crawler/sources').catch((e) => {
        throw new Error(`/api/sources: ${(e as Error).message}`);
      }),
      fbFetch<LaunchStatus>('crawler/launch/status').catch(() => ({} as LaunchStatus)),
      // Browsers/profiles list is non-critical: empty array on error
      // means the dropdown shows "Chưa có tài khoản" without breaking
      // the rest of the panel.
      fbFetch<CrawlerBrowser[]>('crawler/browsers').catch(() => [] as CrawlerBrowser[]),
    ])
      .then(([src, lch, brs]) => {
        if (cancelled) return;
        setSources(Array.isArray(src) ? src : []);
        setLaunch(lch ?? null);
        setBrowsers(Array.isArray(brs) ? brs : []);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
        setSources([]);
        setLaunch(null);
        setBrowsers([]);
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

  // Auto-launch Chrome with --remote-debugging-port when CDP isn't ready
  // and we have at least one Chrome profile available. Without this the
  // "Thu thập" button stays disabled forever — the user has to launch
  // Chrome by hand before opening the Crawl tab.
  //
  // We pick the first browser that has an `exe` + at least one profile
  // (always Chrome on Windows in practice). If launch succeeds we trigger
  // an immediate re-poll so the warning panel clears without waiting
  // the full 30s.
  useEffect(() => {
    if (error) return;
    if (launch?.ready === true) return;
    if (browsers.length === 0) return;
    const target = browsers.find((b) => b.exe && b.profiles.length > 0);
    if (!target || !target.exe) return;
    const profile = target.profiles[0];
    // mdp-crawler's launch() passes profile straight to Chrome as
    // `--profile-directory=<value>`. Chrome expects the profile folder
    // name (e.g. "Default", "Profile 8"), NOT the full User Data path —
    // a full path is silently ignored and Chrome falls back to the
    // default profile, which is usually already locked by another
    // instance. The User Data dir is the OS default on Windows
    // (%LOCALAPPDATA%\Google\Chrome\User Data), which is what `browsers`
    // already reports as `user_data`.
    if (!profile.dir) return;
    let cancelled = false;
    fbFetch<{ ok?: boolean; error?: string }>('crawler/launch', {
      method: 'POST',
      body: JSON.stringify({
        exe: target.exe,
        profile: profile.dir,
        port: 9222,
        // force=true quits any lingering Chrome first so the new process
        // owns the profile lock AND can bind --remote-debugging-port.
        // Without this Chrome silently exits when another instance owns
        // the default profile.
        force: true,
      }),
    })
      .then(() => {
        if (cancelled) return;
        // Re-poll so launch.ready reflects the new CDP debugger state.
        window.setTimeout(() => setTick((t) => t + 1), 1500);
      })
      .catch(() => {
        // Swallow — the warning panel already covers the failure.
      });
    return () => {
      cancelled = true;
    };
  }, [error, launch?.ready, browsers]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { sources, launch, browsers, loading, error, reload };
}
