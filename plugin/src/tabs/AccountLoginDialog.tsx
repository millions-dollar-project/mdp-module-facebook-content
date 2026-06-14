/**
 * AccountLoginDialog — wraps useAccountLogin.
 *
 * Opens a visible Playwright browser pointed at the persistent profile
 * of an FB account. The user logs in manually there; the dialog polls
 * the sidecar every 2s and shows the current status.
 *
 * Vietnamese copy matches the SCA reference so users see the same
 * prompts they had in the old product.
 */
import React from 'react';
import { Button, FormField, Input, Modal } from '../components';
import { useAccountLogin } from '../hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Existing profile path the account was registered with. */
  profilePath: string;
  /** Optional — pre-fill the email field in the visible browser. */
  email?: string;
  /** Optional — display name of the account in the dialog header. */
  accountName?: string;
  onSuccess?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Đang khởi động trình duyệt…',
  running: 'Đang chờ bạn đăng nhập trong trình duyệt hiện ra. Hoàn tất đăng nhập rồi quay lại đây.',
  completed: 'Đăng nhập thành công. Bạn có thể đóng cửa sổ trình duyệt.',
  failed: 'Đăng nhập thất bại',
  expired: 'Đã hủy hoặc hết phiên',
};

export const AccountLoginDialog: React.FC<Props> = ({ open, onClose, profilePath, email, accountName, onSuccess }) => {
  const { session, starting, error, start, cancel, reset } = useAccountLogin();

  // Auto-start when the dialog opens.
  React.useEffect(() => {
    if (open && !session && !starting) {
      void start(profilePath, email);
    }
    if (!open && session) {
      reset();
    }
  }, [open, session, starting, profilePath, email, start, reset]);

  React.useEffect(() => {
    if (session?.status === 'completed') {
      onSuccess?.();
    }
  }, [session, onSuccess]);

  const status = session?.status ?? 'pending';
  const label = STATUS_LABEL[status] ?? status;

  return (
    <Modal open={open} onClose={onClose} title={`Đăng nhập thủ công${accountName ? ` — ${accountName}` : ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360 }}>
        <p style={{ margin: 0 }}>{label}</p>
        {session?.lastError && (
          <div className="fb-error">{session.lastError}</div>
        )}
        {error && <div className="fb-error">{error}</div>}
        <FormField label="Profile path" hint="Trình duyệt sẽ dùng profile này để lưu cookie đăng nhập">
          <Input value={profilePath} readOnly />
        </FormField>
        {email && (
          <FormField label="Email (đã điền sẵn vào form Facebook)">
            <Input value={email} readOnly />
          </FormField>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {status === 'running' || status === 'pending' ? (
            <Button variant="secondary" onClick={cancel}>Hủy</Button>
          ) : (
            <Button onClick={onClose}>Đóng</Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
