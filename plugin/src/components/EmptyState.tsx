import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, subtitle, action, className }) => {
  return (
    <div className={['fb-empty', className ?? ''].filter(Boolean).join(' ')}>
      {icon && <div className="fb-empty__icon">{icon}</div>}
      <h4 className="fb-empty__title">{title}</h4>
      {subtitle && <p className="fb-empty__subtitle">{subtitle}</p>}
      {action && <div className="fb-empty__action">{action}</div>}
    </div>
  );
};

export default EmptyState;
