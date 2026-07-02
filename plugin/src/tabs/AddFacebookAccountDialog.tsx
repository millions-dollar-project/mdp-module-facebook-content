/**
 * AddFacebookAccountDialog — name-prompt modal that precedes the
 * AccountLoginDialog flow on the FB-content account picker.
 *
 * Mirrors FB Studio "Thêm tài khoản Facebook" copy exactly (title,
 * subtitle, button labels). Auto-suggests the next free `acc-NNN` based
 * on existing account names and validates against duplicates + blank
 * input before forwarding the trimmed name to `onConfirm`.
 */
import React from 'react';
import { Button, FormField, Input, Modal } from '../components';

export interface AddFacebookAccountDialogProps {
  open: boolean;
  existingNames: string[];
  onClose: () => void;
  onConfirm: (name: string) => void;
}

/**
 * Compute the next free `acc-NNN` by scanning existing names and picking
 * max(N)+1, zero-padded to 3 digits. Names not matching `/^acc-\d+$/` are
 * ignored — users may have non-numeric legacy accounts. Returns
 * `acc-001` when no `acc-NNN` exists.
 */
function suggestNextName(existingNames: string[]): string {
  let max = 0;
  for (const name of existingNames) {
    const m = /^acc-(\d+)$/.exec(name);
    if (m) {
      const v = parseInt(m[1], 10);
      if (Number.isFinite(v) && v > max) max = v;
    }
  }
  return `acc-${(max + 1).toString().padStart(3, '0')}`;
}

export const AddFacebookAccountDialog: React.FC<AddFacebookAccountDialogProps> = ({
  open,
  existingNames,
  onClose,
  onConfirm,
}) => {
  const defaultName = React.useMemo(() => suggestNextName(existingNames), [existingNames]);
  const [name, setName] = React.useState(defaultName);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  // Re-seed the input when the dialog opens or defaults change.
  React.useEffect(() => {
    if (open) {
      setName(defaultName);
      setSubmitAttempted(false);
    }
  }, [open, defaultName]);

  const trimmed = name.trim();
  const validationError =
    trimmed.length === 0
      ? 'Tên tài khoản không được để trống'
      : existingNames.includes(trimmed)
        ? `"${trimmed}" đã tồn tại — chọn tên khác`
        : null;

  // Show the error only after the user attempts to submit, or while they
  // are actively typing a new value (so they get immediate feedback
  // without being yelled at on dialog open).
  const showError = submitAttempted && validationError != null;
  const displayError = showError ? validationError : null;

  const handleSubmit = () => {
    if (validationError) {
      setSubmitAttempted(true);
      return;
    }
    onConfirm(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thêm tài khoản Facebook"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            data-testid="add-account-cancel"
            aria-label="Hủy"
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            data-testid="add-account-submit"
            aria-label="Thêm + mở trình duyệt"
          >
            Thêm + mở trình duyệt
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360 }}>
        <p style={{ margin: 0 }}>Đặt tên cho tài khoản mới — hệ thống sẽ tự mở trình duyệt để bạn đăng nhập.</p>
        <FormField label="Tên tài khoản" error={displayError}>
          <Input
            data-testid="add-account-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSubmitAttempted(false);
            }}
            onKeyDown={handleKeyDown}
            invalid={displayError != null}
            autoFocus
            placeholder="acc-001"
          />
        </FormField>
      </div>
    </Modal>
  );
};

export default AddFacebookAccountDialog;
