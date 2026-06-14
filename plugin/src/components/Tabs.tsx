import React from 'react';

export interface TabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export interface TabsProps<T extends string = string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  size = 'md',
  fullWidth = false,
  className,
}: TabsProps<T>) {
  const cls = [
    'fb-tabs',
    `fb-tabs--${size}`,
    fullWidth ? 'fb-tabs--full' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div role="tablist" className={cls}>
      {items.map((it) => {
        const selected = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={['fb-tab', selected ? 'fb-tab--active' : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(it.id)}
          >
            {it.icon && <span className="fb-tab__icon">{it.icon}</span>}
            <span className="fb-tab__label">{it.label}</span>
            {it.badge != null && <span className="fb-tab__badge">{it.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
