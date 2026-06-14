/**
 * Toast — notification slide ra từ góc trên phải.
 *
 * 3 tone: success (xanh lá), error (đỏ), warning (vàng), info (xanh dương).
 * Auto-dismiss sau `duration` ms (default 3500) với fade-out 300ms.
 *
 * Dùng:
 *   const toast = useToast();
 *   toast.success('Đã xóa tài khoản');
 *   toast.error('Lỗi: sidecar unavailable');
 *   toast.warning('Lưu ý: profile Playwright sẽ KHÔNG bị xóa');
 */
import React from 'react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  /** ms trước khi bắt đầu fade-out. Default 3500. */
  duration?: number;
}

interface ToastContextValue {
  push: (msg: string, tone?: ToastTone, duration?: number) => void;
  success: (msg: string, duration?: number) => void;
  error: (msg: string, duration?: number) => void;
  warning: (msg: string, duration?: number) => void;
  info: (msg: string, duration?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let nextId = 1;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  // Map timers by id so we can cancel on manual dismiss.
  const timers = React.useRef<Map<number, number>>(new Map());

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const scheduleRemove = React.useCallback(
    (id: number, duration: number) => {
      // Mark fading class first, then actually remove after CSS animation.
      const handle = window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
        timers.current.delete(id);
      }, duration + 300); // 300ms = fade-out duration in CSS
      timers.current.set(id, handle);
    },
    [],
  );

  const push = React.useCallback(
    (message: string, tone: ToastTone = 'info', duration = 3500) => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, message, tone, duration }]);
      scheduleRemove(id, duration);
    },
    [scheduleRemove],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      push,
      success: (m, d) => push(m, 'success', d),
      error: (m, d) => push(m, 'error', d),
      warning: (m, d) => push(m, 'warning', d),
      info: (m, d) => push(m, 'info', d),
      dismiss,
    }),
    [push, dismiss],
  );

  React.useEffect(() => {
    // Cleanup all timers on unmount.
    const t = timers.current;
    return () => {
      t.forEach((h) => window.clearTimeout(h));
      t.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Fallback: log to console if used outside provider (dev safety).
    // Throwing would break rendering, so we degrade gracefully.
    if (typeof window !== 'undefined') {
      console.warn('[Toast] useToast called without <ToastProvider>');
    }
    return {
      push: (m) => console.log('[toast]', m),
      success: (m) => console.log('[toast success]', m),
      error: (m) => console.error('[toast error]', m),
      warning: (m) => console.warn('[toast warning]', m),
      info: (m) => console.log('[toast info]', m),
      dismiss: () => {},
    };
  }
  return ctx;
};

const ICONS: Record<ToastTone, string> = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
};

const ToastViewport: React.FC<{
  items: ToastItem[];
  onDismiss: (id: number) => void;
}> = ({ items, onDismiss }) => {
  return (
    <div className="fb-toast-viewport" role="region" aria-live="polite" aria-label="Notifications">
      {items.map((t) => (
        <div
          key={t.id}
          className={`fb-toast fb-toast--${t.tone}`}
          role={t.tone === 'error' ? 'alert' : 'status'}
          onClick={() => onDismiss(t.id)}
        >
          <span className="fb-toast__icon" aria-hidden="true">{ICONS[t.tone]}</span>
          <span className="fb-toast__msg">{t.message}</span>
          <button
            type="button"
            className="fb-toast__close"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(t.id);
            }}
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastProvider;
