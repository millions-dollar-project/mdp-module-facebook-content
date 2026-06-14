import React from 'react';
import { Card, DataTable, EmptyState, Badge } from '../../components';
import type { DataTableColumn } from '../../components';
import { formatDateTime, truncate } from '../../lib/format';
import type { PostHistoryEntry } from '../../lib/types';

export interface RecentPostsProps {
  posts: PostHistoryEntry[];
  loading?: boolean;
  limit?: number;
}

export const RecentPosts: React.FC<RecentPostsProps> = ({ posts, loading, limit }) => {
  const data = limit ? posts.slice(0, limit) : posts;
  const columns: DataTableColumn<PostHistoryEntry>[] = [
    { key: 'time', header: 'Đăng lúc', width: '160px', render: (p) => <span className="fb-mono">{formatDateTime(p.publishedAt)}</span> },
    { key: 'content', header: 'Nội dung', render: (p) => <span title={p.content}>{truncate(p.content, 50)}</span> },
    { key: 'likes', header: 'Like', align: 'right', width: '70px', render: (p) => <strong>{p.likes.toLocaleString('vi-VN')}</strong> },
    { key: 'comments', header: 'Cmt', align: 'right', width: '70px', render: (p) => p.comments.toLocaleString('vi-VN') },
    { key: 'shares', header: 'Share', align: 'right', width: '70px', render: (p) => p.shares.toLocaleString('vi-VN') },
    { key: 'status', header: 'Trạng thái', width: '110px', render: () => <Badge tone="success">Đã đăng</Badge> },
  ];
  return (
    <Card title="Bài viết gần đây" padded={false}>
      <DataTable<PostHistoryEntry>
        columns={columns}
        rows={data}
        rowKey={(p) => p.id}
        loading={loading}
        size="sm"
        emptyState={<EmptyState title="Chưa có bài đăng nào" subtitle="Các bài đã đăng thành công sẽ hiện ở đây." />}
      />
    </Card>
  );
};

export default RecentPosts;
