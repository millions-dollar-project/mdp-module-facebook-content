import React from 'react';
import { Card, Badge } from '../../components';
import { formatNumber, formatPercent } from '../../lib/format';

export interface StatCardProps {
  label: string;
  value: number | string;
  delta?: number;
  hint?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  format?: 'number' | 'percent' | 'text';
}

const toneToVariant = (tone: StatCardProps['tone']): 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'info' =>
  tone ?? 'neutral';

export const StatCard: React.FC<StatCardProps> = ({ label, value, delta, hint, tone, format = 'number' }) => {
  const display = (() => {
    if (format === 'percent') return formatPercent(typeof value === 'number' ? value : null);
    if (format === 'number') return formatNumber(typeof value === 'number' ? value : null);
    return String(value);
  })();
  return (
    <Card padded>
      <div className="fb-stat">
        <p className="fb-stat__label">{label}</p>
        <p className="fb-stat__value">{display}</p>
        <div className="fb-stat__footer">
          {delta != null && (
            <Badge tone={delta >= 0 ? 'success' : 'danger'}>
              {delta >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(delta))}
            </Badge>
          )}
          {hint && <span className="fb-stat__hint">{hint}</span>}
        </div>
        {tone && <span className={`fb-stat__accent fb-stat__accent--${toneToVariant(tone)}`} aria-hidden />}
      </div>
    </Card>
  );
};

export default StatCard;
