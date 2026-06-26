/**
 * Network layer for the Facebook module.
 *
 * In dev (running outside mdp-shell) we call the Go backend directly via
 * fetch. In prod the mdp-shell injects `window.mdp.ipc.invoke` and we
 * prefer it: it survives when the renderer has no network access to the
 * backend and lets the shell route through the main process.
 */

export const PLATFORM = 'facebook';
export const DISPLAY = 'Facebook';

// Convention from workspace root CLAUDE.md: facebook = 8081, but the
// facebook-content module shares the prefix with the older facebook
// module and dev runner splits them onto 8081 / 8086 respectively.
// We default to 8086 (the content module) and let VITE_FB_PORT override.
const envPort =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string> }).env?.VITE_FB_PORT;
export const BACKEND_PORT = envPort ?? '8086';
export const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1/${PLATFORM}`;

type ShellWindow = Window & {
  mdp?: {
    ipc?: {
      invoke: (channel: string, payload: unknown) => Promise<unknown>;
    };
  };
};

export interface FbFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /**
   * When true and the shell IPC is present, prefer IPC over direct fetch.
   * Defaults to true so prod-style routing always wins.
   */
  preferIpc?: boolean;
}

const toChannel = (path: string): string => {
  // /api/v1/facebook/foo-bar → "facebook:foo-bar"
  const cleaned = path.replace(/^\/+/, '').replace(/^api\/v\d+\/[^/]+\//, '');
  return `${PLATFORM}:${cleaned}`;
};

const ipcInvoke = async <T = unknown>(channel: string, payload?: unknown): Promise<T> => {
  const w = typeof window !== 'undefined' ? (window as ShellWindow) : undefined;
  if (!w?.mdp?.ipc?.invoke) {
    throw new Error('No IPC bridge available (mdp.ipc.invoke missing)');
  }
  return (await w.mdp.ipc.invoke(channel, payload)) as T;
};

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    if ('message' in err && typeof (err as Record<string, unknown>).message === 'string') {
      return (err as Record<string, unknown>).message as string;
    }
    if ('error' in err && typeof (err as Record<string, unknown>).error === 'string') {
      return (err as Record<string, unknown>).error as string;
    }
    try { return JSON.stringify(err); } catch { /* ignore */ }
  }
  return 'Unknown error';
}

export async function fbFetch<T = unknown>(
  path: string,
  options: FbFetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, signal, preferIpc = true } = options;
  const channel = toChannel(path);

  const shell = typeof window !== 'undefined' ? (window as ShellWindow).mdp : undefined;
  const useIpc = preferIpc && Boolean(shell?.ipc?.invoke);

  // Methods with a body go straight to proxy_to_backend. The shell's
  // generic IPC channel (`facebook:<path>`) is meant for state mutation
  // commands the shell knows about; it does NOT forward arbitrary POST
  // bodies to the Go backend, so attempts on it silently misroute and
  // look like "click does nothing" to the user. proxy_to_backend is the
  // one path that actually delivers the body verbatim.
  const skipGenericIpc = Boolean(body) && method !== 'GET';

  if (useIpc && !skipGenericIpc) {
    try {
      return await ipcInvoke<T>(channel, body);
    } catch (err) {
      const msg = extractErrorMessage(err);
      // If IPC failed because the handler is not registered, fall back to
      // direct HTTP so dev workflows still work when the shell lacks a
      // backend-forwarding handler.
      if (
        msg.includes('No handler registered') ||
        msg.includes('not registered') ||
        msg.includes('Command') ||
        msg.includes('not found')
      ) {
        // fallthrough to proxy below
      } else {
        throw new Error(msg);
      }
    }

    // Second-chance: forward through the Tauri main process via
    // `proxy_to_backend` so we can reach the Go backend without WebView2
    // blocking a cross-origin fetch to its own loopback port.
    if (shell?.ipc?.invoke && BACKEND_PORT) {
      try {
        const port = Number(BACKEND_PORT);
        const fullPath = `${API_BASE.replace(/^https?:\/\/[^/]+/, '')}${path.startsWith('/') ? path : `/${path}`}`;
        const bodyBytes = body ? new TextEncoder().encode(JSON.stringify(body)) : null;
        const raw = (await shell.ipc.invoke('proxy_to_backend', {
          port,
          path: fullPath,
          method,
          body: bodyBytes,
          contentType: body ? 'application/json' : null,
        })) as number[] | null;
        const bytes = raw ? new Uint8Array(raw) : null;
        const text = bytes ? new TextDecoder().decode(bytes) : '';
        if (!text) return undefined as T;
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && 'data' in parsed) {
          return (parsed as { data: T }).data;
        }
        return parsed as T;
      } catch (err) {
        // fallthrough to direct HTTP (dev shell with vite proxy etc.)
      }
    }
  }

  const init: RequestInit = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  };
  const res = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`fbFetch ${path} failed: ${res.status} ${text}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  // Unwrap the common { data: T } envelope if present.
  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}
