import React from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, size = 'md', children, footer, className }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fb-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={['fb-modal__panel', `fb-modal__panel--${size}`, className ?? ''].filter(Boolean).join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <header className="fb-modal__header">
            <h3 className="fb-modal__title">{title}</h3>
            <button type="button" className="fb-modal__close" onClick={onClose} aria-label="Đóng">
              ×
            </button>
          </header>
        )}
        <div className="fb-modal__body">{children}</div>
        {footer && <footer className="fb-modal__footer">{footer}</footer>}
      </div>
    </div>
  );
};

export default Modal;
