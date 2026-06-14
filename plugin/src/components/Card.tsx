import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  actions,
  footer,
  padded = true,
  className,
  children,
  ...rest
}) => {
  const cls = ['fb-card', padded ? 'fb-card--padded' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={cls} {...rest}>
      {(title || actions) && (
        <header className="fb-card__header">
          <div className="fb-card__titles">
            {title && <h3 className="fb-card__title">{title}</h3>}
            {subtitle && <p className="fb-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="fb-card__actions">{actions}</div>}
        </header>
      )}
      <div className="fb-card__body">{children}</div>
      {footer && <footer className="fb-card__footer">{footer}</footer>}
    </div>
  );
};

export default Card;
