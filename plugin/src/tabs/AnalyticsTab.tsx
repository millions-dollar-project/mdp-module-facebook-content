import React from 'react';
import { PageHeader, Tabs, StatCard } from '../components';
import { EngagementChart } from '../sections/analytics/EngagementChart';
import { DailyStatsView } from '../sections/analytics/DailyStats';
import { PostBreakdown } from '../sections/analytics/PostBreakdown';
import { useAnalytics, useDailyStats, usePostHistory } from '../hooks';

type Range = '7d' | '30d' | '90d';
const RANGES: { id: Range; label: string }[] = [
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: '90d', label: '90 ngày' },
];

export const AnalyticsTab: React.FC = () => {
  const [range, setRange] = React.useState<Range>('30d');
  const { data: analytics } = useAnalytics(range);
  const { data: daily } = useDailyStats();
  const { data: history } = usePostHistory();

  return (
    <div className="fb-tab fb-tab--analytics">
      <PageHeader
        title="Phân tích"
        subtitle="Theo dõi hiệu quả bài viết và tương tác"
        actions={<Tabs<Range> items={RANGES} value={range} onChange={setRange} size="sm" />}
      />
      <div className="fb-stats-grid">
        <StatCard label="Tổng bài" value={analytics.totalPosts} tone="brand" />
        <StatCard label="Like" value={analytics.totalLikes} tone="success" />
        <StatCard label="Comment" value={analytics.totalComments} tone="info" />
        <StatCard label="Share" value={analytics.totalShares} tone="warning" />
        <StatCard label="Reach" value={analytics.totalReach} tone="brand" />
        <StatCard label="Engagement rate" value={analytics.engagementRate} format="percent" tone="success" />
      </div>
      <EngagementChart data={analytics} />
      <PostBreakdown posts={history} />
      <DailyStatsView data={daily} />
    </div>
  );
};

export default AnalyticsTab;
