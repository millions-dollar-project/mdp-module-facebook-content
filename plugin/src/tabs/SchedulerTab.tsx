import React from 'react';
import { PageHeader, Tabs, Card } from '../components';
import { ScheduleList, UpcomingSummary, UpcomingStats } from '../sections/scheduler/ScheduleList';
import { ScheduleForm, ScheduleFormValue } from '../sections/scheduler/ScheduleForm';
import { usePages, useScheduler } from '../hooks';
import { fbFetch } from '../lib/api';

type Status = 'all' | 'pending' | 'failed';

const FILTERS: { id: Status; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Đang chờ' },
  { id: 'failed', label: 'Lỗi' },
];

export const SchedulerTab: React.FC = () => {
  const { data: posts } = useScheduler();
  const { data: pages } = usePages();
  const [filter, setFilter] = React.useState<Status>('all');
  const [form, setForm] = React.useState<ScheduleFormValue>({
    pageId: '',
    content: '',
    scheduledAt: '',
  });
  const [status, setStatus] = React.useState<string>('');

  const stats: UpcomingStats = {
    total: posts.length,
    pending: posts.filter((p) => p.status === 'SCHEDULED' || p.status === 'APPROVED' || p.status === 'PENDING_REVIEW').length,
    published: posts.filter((p) => p.status === 'PUBLISHED').length,
    failed: posts.filter((p) => p.status === 'FAILED').length,
  };

  const filtered = React.useMemo(() => {
    if (filter === 'all') return posts;
    if (filter === 'pending') return posts.filter((p) => ['SCHEDULED', 'APPROVED', 'PENDING_REVIEW'].includes(p.status));
    if (filter === 'failed') return posts.filter((p) => p.status === 'FAILED');
    return posts;
  }, [posts, filter]);

  const handleSchedule = async (): Promise<void> => {
    setStatus('submitting');
    try {
      await fbFetch('schedule-post', { method: 'POST', body: form });
      setStatus('Đã lên lịch ✓');
      setForm({ pageId: '', content: '', scheduledAt: '' });
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handlePublishNow = async (p: { id: string }): Promise<void> => {
    try {
      await fbFetch('publish-scheduled-now', { method: 'POST', body: { id: p.id } });
      setStatus(`Đã đăng ${p.id}`);
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handleCancel = async (p: { id: string }): Promise<void> => {
    try {
      await fbFetch('cancel-schedule', { method: 'POST', body: { id: p.id } });
      setStatus(`Đã hủy ${p.id}`);
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <div className="fb-tab fb-tab--scheduler">
      <PageHeader
        title="Lịch đăng"
        subtitle="Quản lý các bài viết đã lên lịch, hủy hoặc đăng ngay"
        actions={<Tabs<Status> items={FILTERS} value={filter} onChange={setFilter} size="sm" />}
      />
      <UpcomingSummary stats={stats} />
      <div className="fb-grid-2">
        <Card title={`Danh sách (${filtered.length})`} padded={false}>
          <ScheduleList posts={filtered} onPublishNow={handlePublishNow} onCancel={handleCancel} />
        </Card>
        <ScheduleForm value={form} onChange={setForm} pages={pages} onSubmit={handleSchedule} />
      </div>
      {status && <p className="fb-muted fb-mono fb-status">{status}</p>}
    </div>
  );
};

export default SchedulerTab;
