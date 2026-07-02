/**
 * useAccountPickerData — adapter that maps the kit-accounts Summary
 * envelope into the cross-platform `AccountCardData` shape consumed
 * by `@mdp-private/kit-ui`'s `ModuleAccountPicker`.
 *
 * Two reasons we keep this in the plugin (not in kit-ui):
 *   1. The picker UI is intentionally platform-agnostic; only the
 *      adapter knows about FB-specific endpoints / fields.
 *   2. Each platform (IG, TikTok, …) can ship its own adapter that
 *      knows its own kit-accounts shape without kit-ui growing
 *      per-platform concerns.
 */
import { useMemo } from 'react';
import { useFBAccounts } from './useRepost';
import type { AccountCardData, AccountStatus } from '@mdp-private/kit-ui';

/** Mirror of kit-accounts `ProxySummary` returned in the Summary envelope. */
interface KitProxySummary {
  type: 'none' | 'http' | 'socks5';
  label?: string;
  server?: string;
  safe?: boolean;
}

interface KitSummaryEnriched {
  name: string;
  platform?: string;
  status?: string;
  healthStatus?: string;
  lastUsedAt?: string;
  sessionExpiresAt?: string;
  warmupStage?: 'fresh' | 'warming' | 'mature';
  healthScore?: number;
  proxy?: KitProxySummary;
}

/**
 * Whole days from now until `iso` (RFC3339). Returns null when the
 * string is missing or invalid; negative / past → 0.
 *
 * Mirrors `sessionDaysFromExpiry` on the Go side so the picker pill
 * stays in sync whether the derivation happened server-side (Summary)
 * or client-side (Detail).
 */
export function sessionDaysFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.floor((t - Date.now()) / 86_400_000);
  if (diff < 0) return 0;
  return diff;
}

const STATUS_MAP: Record<string, AccountStatus> = {
  active: 'active',
  disabled: 'disabled',
  expired: 'expired',
  dead: 'dead',
  // Backend may report login drift under a different label; map both.
  needs_login: 'needs-login',
  'needs-login': 'needs-login',
};

function normalizeStatus(raw: string | undefined): AccountStatus {
  if (!raw) return 'active';
  return STATUS_MAP[raw] ?? 'active';
}

export function useAccountPickerData(): {
  accounts: AccountCardData[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const { data: accounts, loading, error, reload } = useFBAccounts();

  const data = useMemo<AccountCardData[]>(() => {
    return accounts.map((a): AccountCardData => {
      // sessionDays / proxy come from the enriched Summary envelope
      // (sessionExpiresAt RFC3339 → client computes days). The Go
      // sidecar only emits the SessionExpiresAt timestamp; the days
      // derivation lives at the edge so the picker is responsive on
      // long-running sessions without a refetch.
      const summaryProxy = (a as unknown as KitSummaryEnriched).proxy;
      const warmupRaw = (a as unknown as { warmupStage?: 'fresh' | 'warming' | 'mature' }).warmupStage
        ?? a.warmup
        ?? undefined;

      // Prefer the backend's nested ProxySummary when present (already
      // pre-trimmed). Fall back to a local flatten of the same shape.
      const proxy: AccountCardData['proxy'] = a.proxy
        ?? (summaryProxy && summaryProxy.type !== 'none'
          ? {
              type: summaryProxy.type,
              label: summaryProxy.label,
              server: summaryProxy.server,
            }
          : undefined);

      return {
        id: a.id,
        name: a.name,
        platform: 'facebook',
        status: normalizeStatus(a.status),
        sessionDays: a.sessionDays ?? null,
        warmup: warmupRaw ?? undefined,
        healthScore: a.healthScore ?? undefined,
        proxy,
      };
    });
  }, [accounts]);

  return { accounts: data, loading, error, reload };
}