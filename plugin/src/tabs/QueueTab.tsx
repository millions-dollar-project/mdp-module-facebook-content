import React from 'react';
import { PageHeader, Card } from '../components';
import { QueueList } from '../sections/queue/QueueList';
import { useQueue } from '../hooks';
import { fbFetch } from '../lib/api';

export const QueueTab: React.FC = () => {
  const { data: items } = useQueue();
  const [status, setStatus] = React.useState<string>('');

  const handleApprove = async (id: string): Promise<void> => {
    try {
      await fbFetch('update-queue-status', { method: 'POST', body: { id, status: 'READY' } });
      setStatus(`Đã duyệt ${id}`);
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handleReject = async (id: string): Promise<void> => {
    try {
      await fbFetch('update-queue-status', { method: 'POST', body: { id, status: 'REJECTED' } });
      setStatus(`Đã loại ${id}`);
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handlePublishNow = async (id: string): Promise<void> => {
    try {
      await fbFetch('publish-now', { method: 'POST', body: { id } });
      setStatus(`Đã đăng ${id}`);
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handleRegenerate = async (id: string): Promise<void> => {
    try {
      await fbFetch('regenerate-content', { method: 'POST', body: { id } });
      setStatus(`Đã tạo lại ${id}`);
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <div className="fb-tab fb-tab--queue">
      <PageHeader
        title="Hàng đợi nội dung"
        subtitle="Duyệt các bài viết từ AI, repost hoặc thủ công trước khi đăng"
      />
      <Card padded={false}>
        <QueueList
          items={items}
          onApprove={(q) => void handleApprove(q.id)}
          onReject={(q) => void handleReject(q.id)}
          onPublishNow={(q) => void handlePublishNow(q.id)}
          onRegenerate={(q) => void handleRegenerate(q.id)}
        />
      </Card>
      {status && <p className="fb-muted fb-mono fb-status">{status}</p>}
    </div>
  );
};

export default QueueTab;
