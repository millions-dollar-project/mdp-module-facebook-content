import React from 'react';
import { Card, Button } from '../../components';
import { formatNumber, formatRelative } from '../../lib/format';
import type { FacebookPage } from '../../lib/types';

/**
 * StatusChip — pill that lights up green when `on` and dims to
 * neutral when off. Use for binary feature flags (AI on/off,
 * Post on/off, active/inactive). Putting "AI on" / "AI off"
 * labels (not just "AI") makes the state obvious at a glance.
 */
const StatusChip: React.FC<{ on: boolean; onLabel: string; offLabel: string; icon?: React.ReactNode }> = ({
  on,
  onLabel,
  offLabel,
  icon,
}) => (
  <span className={['fb-status-chip', on ? 'fb-status-chip--on' : 'fb-status-chip--off'].join(' ')}>
    {icon && <span className="fb-status-chip__icon">{icon}</span>}
    {on ? onLabel : offLabel}
  </span>
);

export interface PageListProps {
  pages: FacebookPage[];
  onEdit?: (p: FacebookPage) => void;
  onTest?: (p: FacebookPage) => void;
  onTogglePosting?: (p: FacebookPage) => void;
  onConfigureAI?: (p: FacebookPage) => void;
  onAdd?: () => void;
  loading?: boolean;
  /**
   * Set of page ids currently selected for bulk actions. When undefined,
   * the list renders without checkboxes (back-compat for any future
   * read-only caller). When provided, each card renders a leading
   * checkbox and the card receives a visual selected state.
   */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export const PageList: React.FC<PageListProps> = ({
  pages,
  onEdit,
  onTest,
  onTogglePosting,
  onConfigureAI,
  onAdd,
  loading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}) => {
  if (loading) return <Card title="Trang Facebook"><p className="fb-muted">Đang tải…</p></Card>;

  const selectable = !!selectedIds && !!onToggleSelect;
  const allChecked = selectable && pages.length > 0 && pages.every((p) => selectedIds!.has(p.id));
  const someChecked = selectable && !allChecked && pages.some((p) => selectedIds!.has(p.id));

  return (
    <Card
      title="Quản lý trang"
      subtitle="Mỗi trang cần một page access token riêng"
      actions={onAdd && <Button onClick={onAdd}>+ Thêm fanpage</Button>}
    >
      {selectable && pages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = someChecked;
            }}
            onChange={onToggleSelectAll}
            aria-label="Chọn tất cả trang"
          />
          <span className="fb-muted">Chọn tất cả ({pages.length})</span>
        </div>
      )}
      <ul className="fb-page-card-list">
        {pages.map((p) => {
          const isSelected = selectable && selectedIds!.has(p.id);
          // Card gets a green accent border when at least one major
          // feature is enabled (AI or post). This makes "what's
          // currently doing work" scannable from a glance.
          const isLive = p.isActive && p.postingEnabled && p.aiEnabled;
          const cls = [
            'fb-page-card',
            !p.isActive ? 'fb-page-card--off' : '',
            isLive ? 'fb-page-card--live' : '',
            isSelected ? 'fb-page-card--selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={p.id} className={cls}>
              <div className="fb-page-card__head">
                {selectable && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect!(p.id)}
                    aria-label={`Chọn trang ${p.pageName}`}
                    style={{ marginRight: 8, accentColor: 'var(--platform-accent)' }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 className="fb-page-card__name">{p.pageName}</h4>
                  <p className="fb-muted fb-page-card__id">ID: {p.pageId} · {p.category ?? '—'}</p>
                </div>
                <div className="fb-page-card__flags">
                  <StatusChip
                    on={p.postingEnabled}
                    onLabel="Post on"
                    offLabel="Post off"
                    icon="📤"
                  />
                  <StatusChip
                    on={p.aiEnabled}
                    onLabel="AI on"
                    offLabel="AI off"
                    icon="🤖"
                  />
                </div>
              </div>
              <div className="fb-page-card__meta">
                <span>👥 {formatNumber(p.followersCount ?? 0)} người theo dõi</span>
                <span>🕐 Hoạt động: {formatRelative(p.lastActiveAt)}</span>
              </div>
              <div className="fb-page-card__actions">
                <div className="fb-page-card__action-group">
                  {onEdit && <Button size="sm" variant="ghost" onClick={() => onEdit(p)}>Sửa token</Button>}
                  {onTest && <Button size="sm" variant="ghost" onClick={() => onTest(p)}>Test kết nối</Button>}
                </div>
                <div className="fb-page-card__action-group fb-page-card__action-group--primary">
                  {onTogglePosting && (
                    <Button
                      size="sm"
                      variant={isLive ? 'success' : 'primary'}
                      onClick={() => onTogglePosting(p)}
                    >
                      {isLive ? 'Page ON' : 'Page OFF'}
                    </Button>
                  )}
                  {onConfigureAI && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onConfigureAI(p)}
                    >
                      AI
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

export default PageList;
