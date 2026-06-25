/**
 * Network client for the mdp-crawler web service.
 *
 * mdp-crawler exposes a FastAPI on its own dev port (default 8787 in
 * production, but the mdp-shell dev runner reserves 8787 for the
 * headroom proxy, so the typical dev port is 9123 or another free
 * port). The plugin reads `VITE_CRAWLER_PORT` so the build can be
 * pointed at whichever port the user started mdp-crawler on.
 *
 * Scope today: read-only list of sources so the Crawl tab can render
 * a "Tài khoản của tôi" dropdown. The actual crawl is still routed
 * through the Go backend (`crawl-page-v2`) — the source picker
 * affects which profile_dir / cdp_url the sidecar uses.
 */

const envPort =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string> }).env?.VITE_CRAWLER_PORT;

export const CRAWLER_PORT = envPort ?? '9123';
export const CRAWLER_BASE = `http://127.0.0.1:${CRAWLER_PORT}`;

export interface CrawlerSource {
  id: string;
  platform?: string;
  enabled?: boolean;
  risk_ack?: boolean;
  render?: string;
  entry_urls?: string[];
  has_profile_dir?: boolean;
  has_cdp_url?: boolean;
  error?: string;
}

export interface LaunchStatus {
  ready?: boolean;
  [key: string]: unknown;
}

export interface CrawlRunResult {
  status?: string;
  new?: number;
  updated?: number;
  error?: string | null;
}

export interface CrawlTrend {
  id?: string;
  post_id?: string;
  author?: string;
  url?: string;
  text?: string;
  posted_at?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  platform?: string;
  [key: string]: unknown;
}

/**
 * Lightweight fetch helper. Unlike fbFetch (which prefers the shell's
 * IPC bridge) we hit mdp-crawler's HTTP directly — there is no IPC
 * handler for crawler endpoints, and the service runs in a separate
 * Python process outside the Tauri main process.
 */
export async function crawlerFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${CRAWLER_BASE}${path.startsWith('/') ? path : `/${path}`}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`crawler ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

/**
 * Kick off a crawl through mdp-crawler (the FastAPI service). Used by
 * the "Tài khoản của tôi" mode in RepostCrawlSection — that mode relies
 * on the source's logged-in CDP browser, which the Go sidecar cannot
 * see (the sidecar manages its own Playwright instance).
 *
 * After the run, trends live in mdp-crawler's local DB; the plugin
 * reads them via `getCrawlerTrends` to populate the result list.
 */
export async function crawlerRun(sourceId: string): Promise<CrawlRunResult> {
  return crawlerFetch<CrawlRunResult>('/api/crawl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: sourceId }),
  });
}

export async function getCrawlerTrends(limit = 50): Promise<CrawlTrend[]> {
  const data = await crawlerFetch<CrawlTrend[]>(`/api/trends?limit=${limit}`);
  return Array.isArray(data) ? data : [];
}
