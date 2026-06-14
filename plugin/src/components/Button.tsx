import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const base =
  'fb-btn';

const variantClass: Record<Variant, string> = {
  primary: 'fb-btn--primary',
  secondary: 'fb-btn--secondary',
  ghost: 'fb-btn--ghost',
  danger: 'fb-btn--danger',
  success: 'fb-btn--success',
};

const sizeClass: Record<Size, string> = {
  sm: 'fb-btn--sm',
  md: 'fb-btn--md',
  lg: 'fb-btn--lg',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  iconLeft,
  iconRight,
  fullWidth = false,
  className,
  children,
  ...rest
}) => {
  const cls = [
    base,
    variantClass[variant],
    sizeClass[size],
    fullWidth ? 'fb-btn--full' : '',
    loading ? 'fb-btn--loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="fb-btn__spinner" aria-hidden /> : iconLeft ? <span className="fb-btn__icon">{iconLeft}</span> : null}
      <span className="fb-btn__label">{children}</span>
      {iconRight ? <span className="fb-btn__icon">{iconRight}</span> : null}
    </button>
  );
};

export default Button;
