import React from 'react';
import { Card, Tabs, EmptyState, Badge, Button } from '../../components';
import { formatRelative, truncate } from '../../lib/format';
import type { QueueItem } from '../../lib/types';

const STATUSES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'NEW', label: 'Mới' },
  { id: 'DRAFTING', label: 'Đang viết' },
  { id: 'REVIEW', label: 'Chờ duyệt' },
  { id: 'READY', label: 'Sẵn sàng' },
  { id: 'PUBLISHED', label: 'Đã đăng' },
  { id: 'REJECTED', label: 'Bị loại' },
] as const;

type Status = (typeof STATUSES)[number]['id'];

const sourceToTone: Record<QueueItem['source'], 'brand' | 'success' | 'warning' | 'info' | 'neutral'> = {
  manual: 'neutral',
  ai: 'brand',
  repost: 'info',
  campaign: 'warning',
};

const statusToTone: Record<QueueItem['status'], 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  NEW: 'neutral',
  DRAFTING: 'warning',
  REVIEW: 'warning',
  READY: 'info',
  PUBLISHED: 'success',
  REJECTED: 'danger',
};

export interface QueueListProps {
  items: QueueItem[];
  onApprove?: (q: QueueItem) => void;
  onReject?: (q: QueueItem) => void;
  onPublishNow?: (q: QueueItem) => void;
  onRegenerate?: (q: QueueItem) => void;
  loading?: boolean;
}

export const QueueList: React.FC<QueueListProps> = ({ items, onApprove, onReject, onPublishNow, onRegenerate, loading }) => {
  const [filter, setFilter] = React.useState<Status>('all');
  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);
  return (
    <Card
      title="Hàng đợi nội dung"
      subtitle={`${items.length} mục — duyệt trước khi đăng`}
      actions={<Tabs items={STATUSES as unknown as { id: string; label: React.ReactNode }[]} value={filter} onChange={(v) => setFilter(v as Status)} size="sm" />}
      padded={false}
    >
      {loading ? (
        <p className="fb-muted">Đang tải…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="Hàng đợi trống" subtitle="AI sẽ tự sinh nội dung theo campaign hoặc bạn có thể soạn thủ công." />
      ) : (
        <ul className="fb-queue-list">
          {filtered.map((it) => (
            <li key={it.id} className="fb-queue-item">
              {it.imageUrl && <img className="fb-queue-item__thumb" src={it.imageUrl} alt="" />}
              <div className="fb-queue-item__body">
                <div className="fb-queue-item__top">
                  <Badge tone={sourceToTone[it.source]}>{it.source}</Badge>
                  <Badge tone={statusToTone[it.status]}>{it.status}</Badge>
                  <span className="fb-muted">{formatRelative(it.createdAt)}</span>
                </div>
                <p className="fb-queue-item__content" title={it.content}>{truncate(it.content, 100)}</p>
                <p className="fb-muted">{it.pageName ?? it.pageId}</p>
              </div>
              <div className="fb-queue-item__actions">
                {it.status === 'REVIEW' && onApprove && <Button size="sm" onClick={() => onApprove(it)}>Duyệt</Button>}
                {it.status === 'REVIEW' && onReject && <Button size="sm" variant="ghost" onClick={() => onReject(it)}>Loại</Button>}
                {it.status === 'READY' && onPublishNow && <Button size="sm" variant="primary" onClick={() => onPublishNow(it)}>Đăng ngay</Button>}
                {(it.status === 'NEW' || it.status === 'DRAFTING') && onRegenerate && <Button size="sm" variant="ghost" onClick={() => onRegenerate(it)}>Tạo lại</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default QueueList;
