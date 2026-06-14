import React from 'react';
import { PageHeader, StatCard, Tabs } from '../components';
import { BestTimesHeatmap, MOCK_HEATMAP_DATA } from '../sections/dashboard/BestTimesHeatmap';
import { ScheduledList } from '../sections/dashboard/ScheduledList';
import { RecentPosts } from '../sections/dashboard/RecentPosts';
import { TrendsList } from '../sections/dashboard/TrendsList';
import { useAnalytics, useDailyStats, usePostHistory, useScheduler, useTrends } from '../hooks';

const DAY_LABELS = ['Hôm nay', '7 ngày', '30 ngày'] as const;
type Day = (typeof DAY_LABELS)[number];

export const DashboardTab: React.FC = () => {
  const [range, setRange] = React.useState<Day>('Hôm nay');
  const { data: analytics } = useAnalytics('30d');
  const { data: stats } = useDailyStats();
  const { data: scheduled } = useScheduler();
  const { data: history } = usePostHistory();
  const { data: trends } = useTrends();

  const today = stats[stats.length - 1];

  return (
    <div className="fb-tab fb-tab--dashboard fb-dashboard">
      <PageHeader
        title="Tổng quan"
        subtitle="Theo dõi hoạt động & xu hướng tài khoản Facebook"
        actions={
          <Tabs<Day>
            items={DAY_LABELS.map((d) => ({ id: d, label: d }))}
            value={range}
            onChange={setRange}
            size="sm"
          />
        }
      />
      <section className="fb-dashboard__section fb-dashboard__kpi">
        <div className="fb-stats-grid">
          <StatCard label="Bài đã đăng" value={today?.postsPublished ?? 0} tone="brand" hint="Hôm nay" />
          <StatCard label="Lịch sắp tới" value={scheduled.filter((s) => s.status === 'SCHEDULED').length} tone="success" hint="Đang chờ" />
          <StatCard label="Tương tác" value={analytics.totalEngagement ?? 0} format="number" tone="info" hint="30 ngày" />
          <StatCard label="Reach" value={analytics.totalReach ?? 0} format="number" tone="warning" hint="30 ngày" />
          <StatCard label="Engagement rate" value={analytics.engagementRate ?? 0} format="percent" hint="30 ngày" />
          <StatCard label="AI replies" value={today?.aiReplies ?? 0} tone="success" hint="Hôm nay" />
        </div>
      </section>
      <section className="fb-dashboard__section">
        <ScheduledList posts={scheduled} limit={5} />
      </section>
      <section className="fb-dashboard__section">
        <BestTimesHeatmap data={MOCK_HEATMAP_DATA} />
      </section>
      <section className="fb-dashboard__section">
        <RecentPosts posts={history} limit={5} />
      </section>
      <section className="fb-dashboard__section">
        <TrendsList trends={trends} />
      </section>
    </div>
  );
};

export default DashboardTab;
