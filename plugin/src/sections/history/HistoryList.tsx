import React from 'react';
import { Card, DataTable, EmptyState, Badge } from '../../components';
import type { DataTableColumn } from '../../components';
import { formatDateTime, formatNumber, formatPercent, truncate } from '../../lib/format';
import type { PostHistoryEntry } from '../../lib/types';

export interface HistoryListProps {
  posts: PostHistoryEntry[];
  onView?: (p: PostHistoryEntry) => void;
  loading?: boolean;
}

export const HistoryList: React.FC<HistoryListProps> = ({ posts, loading }) => {
  const columns: DataTableColumn<PostHistoryEntry>[] = [
    { key: 'time', header: 'Đăng lúc', width: '150px', render: (p) => <span className="fb-mono">{formatDateTime(p.publishedAt)}</span> },
    { key: 'page', header: 'Trang', width: '160px', render: (p) => p.pageName },
    { key: 'content', header: 'Nội dung', render: (p) => <span title={p.content}>{truncate(p.content, 60)}</span> },
    { key: 'likes', header: 'Like', align: 'right', width: '80px', render: (p) => formatNumber(p.likes) },
    { key: 'comments', header: 'Cmt', align: 'right', width: '70px', render: (p) => formatNumber(p.comments) },
    { key: 'shares', header: 'Share', align: 'right', width: '70px', render: (p) => formatNumber(p.shares) },
    { key: 'reach', header: 'Reach', align: 'right', width: '90px', render: (p) => formatNumber(p.reach) },
    { key: 'er', header: 'ER', align: 'right', width: '70px', render: (p) => p.engagementRate != null ? <Badge tone="brand">{formatPercent(p.engagementRate)}</Badge> : '—' },
    { key: 'actions', header: '', align: 'right', width: '100px', render: (p) => p.postUrl ? <a className="fb-link" href={p.postUrl} target="_blank" rel="noreferrer">↗ Xem</a> : null },
  ];
  return (
    <Card title="Lịch sử đã đăng" subtitle={`${posts.length} bài trong khoảng đang lọc`} padded={false}>
      <DataTable<PostHistoryEntry>
        columns={columns}
        rows={posts}
        rowKey={(p) => p.id}
        loading={loading}
        size="sm"
        emptyState={<EmptyState title="Chưa có lịch sử" subtitle="Các bài đã đăng thành công sẽ hiển thị ở đây." />}
      />
    </Card>
  );
};

export default HistoryList;
