/**
 * Network client for the mdp-crawler web service.
 *
 * The plugin talks to the Go backend (mdp-module-facebook-content's
 * /api/v1/facebook/crawler/*) which proxies the four calls we need:
 *   GET  /crawler/sources       — list YAML source configs
 *   GET  /crawler/launch/status — CDP debugger readiness
 *   POST /crawler/crawl         — kick off a crawl ({source: <id>})
 *   GET  /crawler/trends        — read fresh trends back
 *
 * The Go backend is the only host WebView2 allows the plugin to reach
 * without an explicit `tauri-plugin-http` capability. Direct fetch to
 * the Python crawler on localhost:9123 is blocked by Tauri 2 — the
 * proxy keeps everything inside the trusted backend boundary.
 *
 * `CRAWLER_PORT` is kept only so the warning UI can tell the user
 * which port to run mdp-crawler on; it isn't used as a fetch target.
 */

const envPort =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string> }).env?.VITE_CRAWLER_PORT;

export const CRAWLER_PORT = envPort ?? '9123';

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