import React from 'react';
import { PageHeader, Tabs } from '../components';
import { HistoryList } from '../sections/history/HistoryList';
import { usePostHistory } from '../hooks';

type Range = '7d' | '30d' | 'all';
const RANGES: { id: Range; label: string }[] = [
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'all', label: 'Tất cả' },
];

export const HistoryTab: React.FC = () => {
  const { data: posts } = usePostHistory();
  const [range, setRange] = React.useState<Range>('30d');
  const filtered = React.useMemo(() => {
    if (range === 'all') return posts;
    const days = range === '7d' ? 7 : 30;
    const cutoff = Date.now() - days * 86400_000;
    return posts.filter((p) => new Date(p.publishedAt).getTime() >= cutoff);
  }, [posts, range]);
  return (
    <div className="fb-tab fb-tab--history">
      <PageHeader
        title="Lịch sử đã đăng"
        subtitle="Xem lại các bài đã đăng và chỉ số tương tác"
        actions={<Tabs<Range> items={RANGES} value={range} onChange={setRange} size="sm" />}
      />
      <HistoryList posts={filtered} />
    </div>
  );
};

export default HistoryTab;
