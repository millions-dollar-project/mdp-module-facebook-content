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

export interface AccountPickerViewProps {
  /** Currently-selected account id (rendered with the primary border). */
  selectedId?: string | null;
  /** Fired when the user picks an existing account card. */
  onPick: (account: AccountCardData) => void;
  /** Fired when the user clicks the dashed "+ account" tile. */
  onAdd: () => void;
}

export const AccountPickerView: React.FC<AccountPickerViewProps> = ({
  selectedId,
  onPick,
  onAdd,
}) => {
  const { accounts, loading, error } = useAccountPickerData();

  // Stable callback identity so the picker doesn't re-render on every
  // account reload.
  const handlePick = useCallback(
    (a: AccountCardData) => onPick(a),
    [onPick],
  );

  return (
    <div className="account-picker-view" style={{ paddingTop: 8 }}>
      <ModuleAccountPicker
        accounts={accounts}
        loading={loading}
        error={error}
        selectedId={selectedId ?? null}
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