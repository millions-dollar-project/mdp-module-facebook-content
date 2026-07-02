/**
 * SelectedAccountContext — plugin-scoped source of truth for "which
 * FB account is the active one across every tab inside FB-content".
 *
 * Before this context existed, each tab (BrainFeedTab / PublishView /
 * RepostCrawlSection) carried its own `selectedAccount*` useState. That
 * meant picking "acc-002" on the BrainFeed dropdown did nothing for
 * the Publish queue or the Crawl section — every tab fell back to its
 * own auto-pick rule and the user saw "click account A but Đăng nhóm
 * uses account Z" bugs.
 *
 * This module:
 *   - Owns the single `AccountCardData | null` for the whole plugin.
 *   - Persists to `localStorage` (FB-content's selectedAccount:{name})
 *     so reloads (HMR or full page) don't drop the selection.
 *   - Re-exposes the `accounts` list + reload trigger via the same
 *     hook so we don't repeat `useFBAccounts()` in every consumer
 *     (also makes it trivial to seed the default once data arrives).
 *
 * Scope: only FB-content. Promote to kit-ui later if other plugins
 * (Instagram, TikTok, …) want the same wiring — for now we keep the
 * blast radius small.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccountCardData } from '@mdp-private/kit-ui';
import { useFBAccounts } from '../hooks/useRepost';

const STORAGE_KEY = 'mdp.fb-content.selectedAccountName';

interface SelectedAccountContextValue {
  /** Currently selected account, null until the picker is initialized. */
  account: AccountCardData | null;
  /** id of the selected account (kitsUuid / display name). Empty string when none. */
  selectedId: string;
  /** All accounts from kit-accounts (mapped to AccountCardData shape). */
  accounts: AccountCardData[];
  loading: boolean;
  error: string | null;
  /** Set the selected account by full record. */
  setAccount: (account: AccountCardData | null) => void;
  /** Set by id; resolves against the loaded list (no-op if id unknown). */
  setAccountById: (id: string) => void;
  /** Force the accounts list to be reloaded (e.g. after add-account). */
  reloadAccounts: () => void;
}

const SelectedAccountContext = React.createContext<SelectedAccountContextValue | null>(null);

interface ProviderProps {
  children: React.ReactNode;
}

export const SelectedAccountProvider: React.FC<ProviderProps> = ({ children }) => {
  const { data: rawAccounts, loading, error, reload } = useFBAccounts();
  const [storedName, setStoredName] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Map raw backend account → AccountCardData (same shape ModuleAccountPicker uses).
  // Done inline (no new hook) to avoid leaking kit-ui types into hooks layer.
  // `proxy` is normalized here so kit-ui's `AccountCardData.proxy` shape
  // ({type,label?,server?} — undefined, not null) is the only thing that
  // leaves this provider. The raw hook may surface either null or
  // populated objects; we collapse both to the kit-ui contract.
  const accounts: AccountCardData[] = useMemo(() => {
    return rawAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      platform: 'facebook',
      status: a.status === 'disabled'
        ? 'disabled'
        : a.status === 'expired' || a.status === 'dead' || a.status === 'needs-login'
          ? a.status === 'needs-login' ? 'needs-login' : a.status
          : 'active',
      sessionDays: a.sessionDays ?? null,
      warmup: a.warmup ?? undefined,
      healthScore: a.healthScore ?? undefined,
      proxy: a.proxy
        ? {
            type: a.proxy.type,
            label: a.proxy.label ?? undefined,
            server: a.proxy.server ?? undefined,
          }
        : undefined,
    }));
  }, [rawAccounts]);

  // Resolve the persisted name back into the live AccountCardData.
  const account = useMemo(() => {
    if (!storedName) return null;
    return accounts.find((a) => a.name === storedName) ?? accounts.find((a) => a.id === storedName) ?? null;
  }, [accounts, storedName]);

  // No auto-pick: the picker is always the first thing the user sees
  // when they open FB Content. Re-selecting is a deliberate action and
  // we keep storedName cleared until they pick. If they DO pick, the
  // localStorage sync below makes the pick survive reloads of the
  // plugin tree (HMR or full reload), which is the only thing an
  // auto-pick used to buy us.

  // Keep storage in sync whenever we deliberately change selection.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (storedName) {
      try { window.localStorage.setItem(STORAGE_KEY, storedName); } catch { /* ignore */ }
    } else {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }, [storedName]);

  // Drop a stored selection that no longer matches any account (deleted/logged-out).
  useEffect(() => {
    if (storedName && !loading && accounts.length > 0 && !account) {
      setStoredName(accounts[0].name);
    }
  }, [account, accounts, loading, storedName]);

  const setAccount = useCallback((next: AccountCardData | null) => {
    setStoredName(next?.name ?? null);
  }, []);

  const setAccountById = useCallback((id: string) => {
    const match = accounts.find((a) => a.id === id);
    if (match) setStoredName(match.name);
  }, [accounts]);

  const value: SelectedAccountContextValue = useMemo(() => ({
    account,
    selectedId: account?.id ?? '',
    accounts,
    loading,
    error,
    setAccount,
    setAccountById,
    reloadAccounts: reload,
  }), [account, accounts, loading, error, setAccount, setAccountById, reload]);

  return (
    <SelectedAccountContext.Provider value={value}>
      {children}
    </SelectedAccountContext.Provider>
  );
};

export function useSelectedAccount(): SelectedAccountContextValue {
  const ctx = React.useContext(SelectedAccountContext);
  if (!ctx) {
    throw new Error('useSelectedAccount must be used inside <SelectedAccountProvider>');
  }
  return ctx;
}
