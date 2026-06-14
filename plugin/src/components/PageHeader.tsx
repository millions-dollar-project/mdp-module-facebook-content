import React from 'react';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, breadcrumb, className }) => {
  return (
    <header className={['fb-page-header', className ?? ''].filter(Boolean).join(' ')}>
      <div className="fb-page-header__main">
        {breadcrumb && <div className="fb-page-header__breadcrumb">{breadcrumb}</div>}
        <h1 className="fb-page-header__title">{title}</h1>
        {subtitle && <p className="fb-page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="fb-page-header__actions">{actions}</div>}
    </header>
  );
};

export default PageHeader;
