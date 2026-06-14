import React from 'react';
import { Button, DataTable, EmptyState, Badge } from '../../components';
import { formatDate, formatPercent } from '../../lib/format';
import type { Campaign, CampaignStatus } from '../../lib/types';

export interface CampaignListProps {
  campaigns: Campaign[];
  onView?: (c: Campaign) => void;
  onPause?: (c: Campaign) => void;
  onResume?: (c: Campaign) => void;
  onCreate?: () => void;
  loading?: boolean;
  /** Selected row ids — owned by parent so section bar can render
   * the bulk-action chip in the top-right corner (matching Tài
   * khoản / Nhóm tabs). */
  selectedIds?: readonly string[];
  onSelectionChange?: (ids: readonly string[]) => void;
  onBulkDelete?: () => void;
  bulkDeleting?: boolean;
}

const statusTone: Record<CampaignStatus, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  draft: 'neutral',
  active: 'success',
  paused: 'warning',
  finished: 'info',
  cancelled: 'danger',
};

const statusLabel: Record<CampaignStatus, string> = {
  draft: 'Nháp',
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  finished: 'Hoàn tất',
  cancelled: 'Đã huỷ',
};

const destinationTone: Record<Campaign['destination'], 'brand' | 'info' | 'success'> = {
  group: 'info',
  page: 'brand',
  personal: 'success',
};

const destinationLabel: Record<Campaign['destination'], string> = {
  group: 'Nhóm',
  page: 'Page',
  personal: 'Cá nhân',
};

const progressCell = (c: Campaign): React.ReactNode => {
  const p = c.progress;
  if (!p) return <span className="fb-muted">—</span>;
  const pct = Math.round((p.published / Math.max(1, p.total)) * 100);
  return (
    <div className="fb-campaign-progress">
      <div className="fb-campaign-progress__bar" aria-label={`${pct}%`}>
        <div className="fb-campaign-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="fb-muted fb-campaign-progress__label">
        {p.published}/{p.total} ({formatPercent(pct / 100)})
      </span>
    </div>
  );
};

export const CampaignList: React.FC<CampaignListProps> = ({
  campaigns,
  onView,
  onPause,
  onResume,
  onCreate,
  loading,
  selectedIds = [],
  onSelectionChange,
  onBulkDelete,
  bulkDeleting = false,
}) => {
  const showBulkBar = selectedIds.length > 0 && Boolean(onBulkDelete);
  const externalMode = Boolean(onSelectionChange) && Boolean(onBulkDelete);

  return (
    <>
      <div className="fb-section__bar">
        {onCreate && <Button onClick={onCreate}>+ Tạo chiến dịch</Button>}
        {showBulkBar && (
          <div className="fb-table__select-bar" role="region" aria-label="Bulk actions">
            <span className="fb-table__select-count">Đã chọn {selectedIds.length}</span>
            <div className="fb-table__select-actions">
              <Button
                variant="ghost"
                onClick={() => onSelectionChange?.([])}
                disabled={bulkDeleting}
              >
                Bỏ chọn
              </Button>
              <Button
                variant="danger"
                onClick={() => onBulkDelete?.()}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? 'Đang xoá…' : `Xóa (${selectedIds.length})`}
              </Button>
            </div>
          </div>
        )}
      </div>
      <DataTable<Campaign>
        columns={[
          {
            key: 'name',
            header: 'Tên',
            render: (c) => <span className="fb-campaign-name">{c.name}</span>,
          },
          {
            key: 'destination',
            header: 'Đăng lên',
            render: (c) => (
              <Badge tone={destinationTone[c.destination]}>{destinationLabel[c.destination]}</Badge>
            ),
          },
          {
            key: 'status',
            header: 'Trạng thái',
            render: (c) => <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>,
          },
          {
            key: 'schedule',
            header: 'Thời gian',
            render: (c) => (
              <span>
                {formatDate(c.startDate)} → {formatDate(c.endDate)} · {c.postsPerDay} bài/ngày
              </span>
            ),
          },
          { key: 'progress', header: 'Tiến độ', render: progressCell },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (c) => (
              <div className="fb-row-actions">
                {onView && (
                  <Button size="sm" variant="ghost" onClick={() => onView(c)}>
                    Xem chi tiết
                  </Button>
                )}
                {c.status === 'active' && onPause && (
                  <Button size="sm" variant="ghost" onClick={() => onPause(c)}>
                    Tạm dừng
                  </Button>
                )}
                {c.status === 'paused' && onResume && (
                  <Button size="sm" onClick={() => onResume(c)}>
                    Tiếp tục
                  </Button>
                )}
                {c.status === 'finished' && c.autoApprove && (
                  <Badge tone="info">auto-approve</Badge>
                )}
                {/* Per-row "Xóa" đã được lược bỏ — xoá chỉ còn một
                 * đường qua bulk bar (tick checkbox → "Xóa (n)"). */}
              </div>
            ),
          },
        ]}
        rows={campaigns}
        rowKey={(c) => c.id}
        loading={loading}
        emptyState={
          <EmptyState
            title="Chưa có chiến dịch nào"
            subtitle="Tạo chiến dịch AI để sinh nội dung tự động theo kế hoạch tháng."
            action={onCreate ? <Button onClick={onCreate}>Tạo chiến dịch</Button> : null}
          />
        }
        onBulkDelete={externalMode ? async () => onBulkDelete?.() : undefined}
        onSelectionChange={externalMode ? (ids) => onSelectionChange?.(ids) : undefined}
        confirmTitle="Xoá chiến dịch đã chọn?"
        confirmMessage={(count) => (
          <p style={{ margin: 0 }}>
            {count} chiến dịch sẽ bị xoá cùng toàn bộ bài đăng đã lên lịch bên trong. Thao tác
            này không thể hoàn tác.
          </p>
        )}
      />
    </>
  );
};

export default CampaignList;
