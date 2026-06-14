import React from 'react';
import { Card, DataTable, EmptyState, Badge, Button } from '../../components';
import type { DataTableColumn } from '../../components';
import { formatDateTime, truncate } from '../../lib/format';
import type { ScheduledPost, PostStatus } from '../../lib/types';

export interface ScheduledListProps {
  posts: ScheduledPost[];
  onPublishNow?: (post: ScheduledPost) => void;
  onCancel?: (post: ScheduledPost) => void;
  loading?: boolean;
  limit?: number;
}

const statusBadge = (status: PostStatus): React.ReactNode => {
  const tone: Record<PostStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'neutral',
    PENDING_REVIEW: 'warning',
    APPROVED: 'info',
    SCHEDULED: 'brand',
    PUBLISHING: 'info',
    PUBLISHED: 'success',
    FAILED: 'danger',
    CANCELLED: 'neutral',
  };
  return <Badge tone={tone[status]}>{status}</Badge>;
};

export const ScheduledList: React.FC<ScheduledListProps> = ({ posts, onPublishNow, onCancel, loading, limit }) => {
  const data = limit ? posts.slice(0, limit) : posts;
  const columns: DataTableColumn<ScheduledPost>[] = [
    {
      key: 'scheduledAt',
      header: 'Lịch đăng',
      width: '160px',
      render: (p) => <span className="fb-mono">{formatDateTime(p.scheduledAt)}</span>,
    },
    {
      key: 'content',
      header: 'Nội dung',
      render: (p) => <span title={p.content}>{truncate(p.content, 60)}</span>,
    },
    {
      key: 'page',
      header: 'Trang',
      width: '180px',
      render: (p) => <span className="fb-muted">{p.pageName ?? p.pageId}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: '120px',
      render: (p) => statusBadge(p.status),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '200px',
      render: (p) => (
        <div className="fb-row-actions">
          {p.status === 'SCHEDULED' && onPublishNow && (
            <Button size="sm" variant="ghost" onClick={() => onPublishNow(p)}>Đăng ngay</Button>
          )}
          {(p.status === 'SCHEDULED' || p.status === 'PENDING_REVIEW') && onCancel && (
            <Button size="sm" variant="ghost" onClick={() => onCancel(p)}>Hủy</Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <Card title="Lịch đăng sắp tới" padded={false}>
      <DataTable<ScheduledPost>
        columns={columns}
        rows={data}
        rowKey={(p) => p.id}
        loading={loading}
        size="sm"
        emptyState={
          <EmptyState
            title="Chưa có bài đăng nào sắp tới"
            subtitle="Tạo bài mới ở tab Bài đăng hoặc đợi chiến dịch AI tự sinh."
          />
        }
      />
    </Card>
  );
};

export default ScheduledList;
