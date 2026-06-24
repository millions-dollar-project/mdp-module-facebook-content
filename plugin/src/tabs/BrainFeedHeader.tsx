/**
 * BrainFeedHeader — filter row above the Brain feed list.
 *
 * Status select + free-text search + total count + Generate / Delete buttons.
 * Parent owns the filter state and the selection set.
 */
import React from 'react';

export interface BrainFeedFilterState {
  sourcePage: string;
  status: string;
  search: string;
}

export interface BrainFeedHeaderProps {
  filter: BrainFeedFilterState;
  onFilterChange: (f: BrainFeedFilterState) => void;
  selectedCount: number;
  total: number;
  isGenerating: boolean;
  onGenerate: () => void;
  onDeleteSelected: () => void;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'ingested', label: 'Đã ingest' },
  { value: 'failed', label: 'Lỗi ingest' },
  { value: 'generated', label: 'Đã generate' },
];

export const BrainFeedHeader: React.FC<BrainFeedHeaderProps> = ({
  filter, onFilterChange, selectedCount, total, isGenerating, onGenerate, onDeleteSelected,
}) => {
  return (
    <div
      style={{
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        padding: '10px 0', borderBottom: '1px solid var(--ds-border)', marginBottom: 10,
      }}
    >
      <select
        value={filter.status}
        onChange={(e) => onFilterChange({ ...filter, status: e.target.value })}
        aria-label="Lọc theo trạng thái"
        data-testid="status-select"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <input
        type="search"
        placeholder="Tìm trong content…"
        value={filter.search}
        onChange={(e) => onFilterChange({ ...filter, search: e.target.value })}
        aria-label="Tìm kiếm"
        data-testid="search-input"
        style={{
          flex: 1, minWidth: 160, padding: '4px 8px',
          borderRadius: 4, border: '1px solid var(--ds-border)',
        }}
      />
      <span style={{ fontSize: 12, color: '#94a3b8' }}>Tổng: {total}</span>
      <button
        type="button"
        disabled={selectedCount === 0 || isGenerating}
        onClick={onGenerate}
        data-testid="generate-button"
        style={{
          padding: '6px 12px', borderRadius: 4, border: 'none',
          background: '#4a90e2', color: '#fff', cursor: 'pointer',
        }}
      >
        {isGenerating ? 'Đang generate…' : `+ Generate (${selectedCount})`}
      </button>
      <button
        type="button"
        disabled={selectedCount === 0}
        onClick={onDeleteSelected}
        data-testid="delete-selected-button"
        style={{
          padding: '6px 12px', borderRadius: 4,
          border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
        }}
      >
        Xoá ({selectedCount})
      </button>
    </div>
  );
};

export default BrainFeedHeader;
