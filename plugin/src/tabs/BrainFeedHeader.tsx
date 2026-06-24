/**
 * BrainFeedHeader — filter row above the Brain feed list.
 *
 * Status select + free-text search + total count + Generate / Delete buttons.
 * Parent owns the filter state and the selection set.
 */
import React from 'react';
import { Button, Input, Select } from '../components';

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
      <Select
        options={STATUS_OPTIONS}
        value={filter.status}
        onChange={(e) => onFilterChange({ ...filter, status: e.target.value })}
        aria-label="Lọc theo trạng thái"
        data-testid="status-select"
        style={{ minWidth: 140 }}
      />
      <Input
        type="search"
        placeholder="Tìm trong content…"
        value={filter.search}
        onChange={(e) => onFilterChange({ ...filter, search: e.target.value })}
        aria-label="Tìm kiếm"
        data-testid="search-input"
        style={{ flex: 1, minWidth: 160 }}
      />
      <span style={{ fontSize: 12, color: 'var(--ds-text-muted)' }}>Tổng: {total}</span>
      <Button
        variant="primary"
        size="sm"
        disabled={selectedCount === 0 || isGenerating}
        loading={isGenerating}
        onClick={onGenerate}
        data-testid="generate-button"
      >
        {isGenerating ? 'Đang generate…' : `+ Generate (${selectedCount})`}
      </Button>
      <Button
        variant="danger"
        size="sm"
        disabled={selectedCount === 0}
        onClick={onDeleteSelected}
        data-testid="delete-selected-button"
      >
        Xoá ({selectedCount})
      </Button>
    </div>
  );
};

export default BrainFeedHeader;