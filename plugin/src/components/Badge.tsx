import React from 'react';

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'hot'
  | 'warm'
  | 'cold'
  | 'positive';

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', children, icon, className }) => {
  const cls = ['fb-badge', `fb-badge--${tone}`, className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {icon && <span className="fb-badge__icon">{icon}</span>}
      {children}
    </span>
  );
};

export default Badge;
