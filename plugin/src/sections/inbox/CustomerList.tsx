import React from 'react';
import { EmptyState, Select } from '../../components';
import { CustomerCard } from './CustomerCard';
import type { Conversation, HeatLevel, FacebookPage } from '../../lib/types';

export type HeatFilter = 'all' | HeatLevel;

export interface CustomerListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (c: Conversation) => void;
  onToggleAi?: (c: Conversation) => void;
  heatFilter: HeatFilter;
  onHeatFilterChange: (f: HeatFilter) => void;
  search: string;
  onSearchChange: (s: string) => void;
  currentPage?: FacebookPage | null;
  pages?: FacebookPage[];
  currentPageId?: string | null;
  onPageChange?: (pageId: string) => void;
  pageAiEnabled?: boolean;
  loading?: boolean;
}

const HEAT_OPTIONS: { id: HeatFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'hot', label: 'Nóng' },
  { id: 'warm', label: 'Ấm' },
  { id: 'cold', label: 'Lạnh' },
];

export const CustomerList: React.FC<CustomerListProps> = ({
  conversations,
  activeId,
  onSelect,
  onToggleAi,
  heatFilter,
  onHeatFilterChange,
  search,
  onSearchChange,
  currentPage,
  pages,
  currentPageId,
  onPageChange,
  loading,
}) => {
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (heatFilter !== 'all' && c.heat !== heatFilter) return false;
      if (!q) return true;
      return (
        c.customerName.toLowerCase().includes(q) ||
        (c.lastMessage ?? '').toLowerCase().includes(q) ||
        Object.values(c.collectedInfo).some((v) => v && String(v).toLowerCase().includes(q))
      );
    });
  }, [conversations, heatFilter, search]);

  const pageOptions = React.useMemo(() => {
    if (!pages || pages.length === 0) return [];
    return pages.map((p) => ({ value: p.id, label: p.pageName }));
  }, [pages]);
  const isPageAiOn = currentPage?.aiEnabled ?? false;

  return (
    <div className="fb-customer-list">
      {/* Head: page selector + compact search */}
      <div className="fb-customer-list__head">
        {pageOptions.length > 0 && (
          <Select
            className="fb-customer-list__pagesel"
            options={pageOptions}
            value={currentPageId ?? ''}
            onChange={(e) => onPageChange?.(e.target.value)}
            placeholder="Chọn trang…"
          />
        )}
        <div className="fb-search-compact">
          <span className="fb-search-compact__icon" aria-hidden>🔎</span>
          <input
            type="search"
            className="fb-search-compact__input"
            placeholder="Tìm…"
            value={search}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
          />
        </div>
      </div>

      {/* Heat filter */}
      <div className="fb-customer-list__filters">
        {HEAT_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={['fb-chip', heatFilter === o.id ? 'fb-chip--on' : ''].filter(Boolean).join(' ')}
            onClick={() => onHeatFilterChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Page AI status + persona */}
      <div className="fb-customer-list__pageai">
        <span
          className={['fb-pageai-statusdot', isPageAiOn ? 'fb-pageai-statusdot--on' : ''].filter(Boolean).join(' ')}
          aria-label={isPageAiOn ? 'AI trang đang bật' : 'AI trang đang tắt'}
          title={isPageAiOn ? 'AI trang đang bật' : 'AI trang đang tắt'}
        />
        <div className="fb-pageai-label">
          <span className="fb-muted">AI trang</span>
          {currentPage && (
            <span className="fb-pageai-persona" title="AI persona của trang này">
              {currentPage.aiRole ?? 'Tư vấn viên'} · {currentPage.aiIndustry ?? 'Mầm non'}
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="fb-customer-list__body">
        {loading ? (
          <p className="fb-muted">Đang tải…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="Không có khách hàng" subtitle="Thử đổi bộ lọc." />
        ) : (
          filtered.map((c) => (
            <CustomerCard
              key={c.id}
              conv={c}
              active={c.id === activeId}
              onClick={() => onSelect(c)}
              onToggleAi={onToggleAi ? () => onToggleAi(c) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default CustomerList;
