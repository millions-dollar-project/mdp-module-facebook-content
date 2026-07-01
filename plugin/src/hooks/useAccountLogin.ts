/**
 * useAccountLogin — wraps the sidecar's manual Playwright login flow.
 *
 * Lifecycle:
 *   start(profilePath) -> { sessionId }
 *   poll every 2s until status is completed/failed/expired
 *   cancel() -> closes the visible browser early
 *
 * The plugin shows "Đang chờ bạn đăng nhập trong trình duyệt..." while
 * the hook is in the 'running' state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fbFetch } from '../lib/api';
import type { AccountLoginSession } from '../lib/types';

export interface UseAccountLoginState {
  session: AccountLoginSession | null;
  starting: boolean;
  error: string | null;
  start: (profilePath: string, email?: string, name?: string) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

const POLL_MS = 2000;

export function useAccountLogin(): UseAccountLoginState {
  const [session, setSession] = useState<AccountLoginSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(
    async (profilePath: string, email?: string, name?: string) => {
      setStarting(true);
      setError(null);
      try {
        // Forward `name` so the sidecar persists kit-accounts artifacts
        // under ~/mdp-data/accounts/<name>/ once the URL leaves /login.
        // Without it the sidecar's persistKitAccount() is skipped and
        // the row never appears in GET /kit-accounts.
        const res = await fbFetch<{ sessionId: string; status: string }>(
          'account-login/start',
          { method: 'POST', body: { profilePath, email, name } },
        );
        const next: AccountLoginSession = {
          sessionId: res.sessionId,
          status: 'running',
          profilePath,
        };
        setSession(next);
        stopPolling();
        pollRef.current = window.setInterval(async () => {
          try {
            const status = await fbFetch<AccountLoginSession>(
              `account-login/status?sessionId=${encodeURIComponent(res.sessionId)}`,
            );
            setSession(status);
            if (status.status !== 'pending' && status.status !== 'running') {
              stopPolling();
              // Defense in depth: if the session completed, force a
              // re-persist via /kit-accounts/login/persist so the
              // on-disk artifacts are present even if the sidecar's
              // auto-persist raced the status flip.
              if (status.status === 'completed' && name) {
                try {
                  await fbFetch('kit-accounts/login/persist', {
                    method: 'POST',
                    body: { sessionId: res.sessionId, name },
                  });
                } catch {
                  // best-effort
                }
              }
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            stopPolling();
          }
        }, POLL_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStarting(false);
      }
    },
    [stopPolling],
  );

  const cancel = useCallback(async () => {
    if (!session) return;
    stopPolling();
    try {
      await fbFetch('account-login/cancel', {
        method: 'POST',
        body: { sessionId: session.sessionId },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSession((s) => (s ? { ...s, status: 'expired' } : s));
  }, [session, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setSession(null);
    setError(null);
  }, [stopPolling]);

  return { session, starting, error, start, cancel, reset };
}
