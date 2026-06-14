import React from 'react';
import { Card, DataTable, EmptyState } from '../../components';
import type { DataTableColumn } from '../../components';
import { formatNumber, formatPercent } from '../../lib/format';
import type { PostHistoryEntry } from '../../lib/types';

export interface PostBreakdownProps {
  posts: PostHistoryEntry[];
  loading?: boolean;
}

export const PostBreakdown: React.FC<PostBreakdownProps> = ({ posts, loading }) => {
  const sorted = [...posts].sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares));
  const top = sorted.slice(0, 10);
  const columns: DataTableColumn<PostHistoryEntry>[] = [
    { key: 'title', header: 'Bài viết', render: (p) => <span title={p.content}>{p.content.slice(0, 50)}{p.content.length > 50 ? '…' : ''}</span> },
    { key: 'likes', header: 'Like', align: 'right', render: (p) => formatNumber(p.likes) },
    { key: 'comments', header: 'Cmt', align: 'right', render: (p) => formatNumber(p.comments) },
    { key: 'shares', header: 'Share', align: 'right', render: (p) => formatNumber(p.shares) },
    { key: 'reach', header: 'Reach', align: 'right', render: (p) => formatNumber(p.reach) },
    { key: 'er', header: 'ER', align: 'right', render: (p) => p.engagementRate != null ? formatPercent(p.engagementRate) : '—' },
  ];
  return (
    <Card title="Top bài viết" subtitle="Xếp theo tổng tương tác" padded={false}>
      <DataTable<PostHistoryEntry>
        columns={columns}
        rows={top}
        rowKey={(p) => p.id}
        loading={loading}
        size="sm"
        emptyState={<EmptyState title="Chưa có dữ liệu" subtitle="Các bài đã đăng sẽ hiển thị tại đây." />}
      />
    </Card>
  );
};

export default PostBreakdown;
