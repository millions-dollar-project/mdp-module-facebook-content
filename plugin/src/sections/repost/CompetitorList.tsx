import React from 'react';
import { Card, DataTable, EmptyState, Badge, Button } from '../../components';
import type { DataTableColumn } from '../../components';
import { formatRelative, formatNumber } from '../../lib/format';
import type { Competitor } from '../../lib/types';

export interface CompetitorListProps {
  competitors: Competitor[];
  onCrawl?: (c: Competitor) => void;
  onAdd?: () => void;
  onRemove?: (c: Competitor) => void;
  loading?: boolean;
}

export const CompetitorList: React.FC<CompetitorListProps> = ({ competitors, onCrawl, onAdd, onRemove, loading }) => {
  const columns: DataTableColumn<Competitor>[] = [
    { key: 'name', header: 'Trang', render: (c) => <strong>{c.pageName}</strong> },
    { key: 'cat', header: 'Danh mục', render: (c) => c.category ?? '—' },
    { key: 'url', header: 'URL', render: (c) => <a href={c.pageUrl} target="_blank" rel="noreferrer" className="fb-link">{c.pageUrl}</a> },
    { key: 'posts', header: 'Bài crawl', align: 'right', render: (c) => formatNumber(c.postsCount) },
    { key: 'last', header: 'Crawl gần nhất', render: (c) => c.lastCrawledAt ? formatRelative(c.lastCrawledAt) : '—' },
    { key: 'status', header: '', width: '110px', render: (c) => <Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Hoạt động' : 'Tạm dừng'}</Badge> },
    {
      key: 'actions', header: '', align: 'right', width: '180px',
      render: (c) => (
        <div className="fb-row-actions">
          {onCrawl && <Button size="sm" variant="ghost" onClick={() => onCrawl(c)}>Crawl</Button>}
          {onRemove && <Button size="sm" variant="danger" onClick={() => onRemove(c)}>Xóa</Button>}
        </div>
      ),
    },
  ];
  return (
    <Card
      title="Trang đối thủ"
      subtitle="Crawl nội dung để repost hoặc phân tích xu hướng"
      actions={onAdd && <Button onClick={onAdd}>+ Thêm đối thủ</Button>}
      padded={false}
    >
      <DataTable<Competitor>
        columns={columns}
        rows={competitors}
        rowKey={(c) => c.id}
        loading={loading}
        size="sm"
        emptyState={<EmptyState title="Chưa có đối thủ" subtitle="Thêm URL Facebook để bắt đầu crawl." />}
      />
    </Card>
  );
};

export default CompetitorList;
