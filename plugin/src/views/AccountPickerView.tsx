/**
 * AccountPickerView — FB-content's first-touch screen.
 *
 * Wraps the cross-platform `ModuleAccountPicker` from kit-ui with our
 * data hook + a "+ account" CTA that opens the existing
 * `AccountLoginDialog`. The shell header (eyebrow + h1 + subtitle)
 * already renders above this — we don't repeat it here.
 */
import React, { useCallback } from 'react';
import {
  ModuleAccountPicker,
  type AccountCardData,
} from '@mdp-private/kit-ui';
import { useAccountPickerData } from '../hooks/useAccountPickerData';
import { useSelectedAccount } from '../state/SelectedAccountContext';

export interface AccountPickerViewProps {
  /** Currently-selected account id (rendered with the primary border). */
  selectedId?: string | null;
  /** Fired when the user picks an existing account card. Optional —
   * the context setter is the authoritative store. */
  onPick?: (account: AccountCardData) => void;
  /** Fired when the user clicks the dashed "+ account" tile. */
  onAdd: () => void;
}

export const AccountPickerView: React.FC<AccountPickerViewProps> = ({
  selectedId,
  onPick,
  onAdd,
}) => {
  const { accounts, loading, error } = useAccountPickerData();
  const { account: ctxAccount, setAccount } = useSelectedAccount();

  // Stable callback identity so the picker doesn't re-render on every
  // account reload. `setAccount` writes into the plugin-wide
  // SelectedAccountContext so every other tab sees the same pick —
  // clicking "acc-002" here makes Brain Feed, Repost Crawl and
  // Publish queue all scope themselves to acc-002.
  const handlePick = useCallback(
    (a: AccountCardData) => {
      setAccount(a);
      onPick?.(a);
    },
    [setAccount, onPick],
  );

  // Prefer the context-derived selection when the parent didn't pass
  // an explicit id. Keeps the highlighted card in sync with whatever
  // tab changed it last.
  const effectiveSelectedId = selectedId ?? ctxAccount?.id ?? null;

  return (
    <div className="account-picker-view" style={{ paddingTop: 8 }}>
      <ModuleAccountPicker
        accounts={accounts}
        loading={loading}
        error={error}
        selectedId={effectiveSelectedId}
        onPick={handlePick}
        onAdd={onAdd}
        emptyTitle="Chưa có Facebook account"
        emptySubtitle="Thêm account đầu tiên để crawl, generate và đăng bài tự động."
        addLabel="Thêm Facebook account"
        addHint="Mở login flow (Playwright + sticky proxy)"
        disableAdd={loading}
      />
    </div>
  );
};

export default AccountPickerView;