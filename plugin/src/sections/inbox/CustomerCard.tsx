import React from 'react';
import { Badge } from '../../components';
import { initials, formatRelative, truncate } from '../../lib/format';
import type { Conversation, HeatLevel } from '../../lib/types';

export interface CustomerCardProps {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
  onToggleAi?: () => void;
}

const heatTone: Record<HeatLevel, 'hot' | 'warm' | 'cold' | 'neutral'> = {
  hot: 'hot',
  warm: 'warm',
  cold: 'cold',
  unknown: 'neutral',
};
const heatLabel: Record<HeatLevel, string> = {
  hot: 'Nóng',
  warm: 'Ấm',
  cold: 'Lạnh',
  unknown: '—',
};

export const CustomerCard: React.FC<CustomerCardProps> = ({ conv, active, onClick, onToggleAi }) => {
  const collectedCount = Object.values(conv.collectedInfo).filter(Boolean).length;

  return (
    <div
      className={['fb-customer', active ? 'fb-customer--active' : ''].filter(Boolean).join(' ')}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div className="fb-customer__avatar">{initials(conv.customerName)}</div>
      <div className="fb-customer__content">
        <div className="fb-customer__row">
          <div className="fb-customer__title">
            <strong className="fb-customer__name">{conv.customerName}</strong>
            {conv.collectedInfo.location && (
              <span className="fb-customer__loc">({conv.collectedInfo.location})</span>
            )}
          </div>
          <Badge tone={heatTone[conv.heat]}>{heatLabel[conv.heat]}</Badge>
        </div>
        <p className="fb-customer__msg">{truncate(conv.lastMessage, 60)}</p>
        <div className="fb-customer__row fb-customer__row--meta">
          <span className="fb-customer__time">{formatRelative(conv.lastMessageAt)}</span>
          <div className="fb-customer__badges">
            {collectedCount > 0 && (
              <span className="fb-pill fb-pill--info">
                <span className="fb-pill__icon">📇</span>
                {collectedCount} info
              </span>
            )}
            {conv.unreadCount > 0 && (
              <span className="fb-pill fb-pill--brand">{conv.unreadCount} mới</span>
            )}
            {onToggleAi && (
              <button
                type="button"
                className={['fb-pill', conv.aiEnabled ? 'fb-pill--ai-on' : 'fb-pill--ai-off'].filter(Boolean).join(' ')}
                onClick={(e) => { e.stopPropagation(); onToggleAi(); }}
              >
                AI {conv.aiEnabled ? 'ON' : 'OFF'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerCard;
