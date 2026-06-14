import React from 'react';
import { Card, Badge } from '../../components';
import type { ScheduledPost } from '../../lib/types';
import { ScheduledList } from '../dashboard/ScheduledList';

export interface ScheduleListProps {
  posts: ScheduledPost[];
  onPublishNow?: (p: ScheduledPost) => void;
  onCancel?: (p: ScheduledPost) => void;
  loading?: boolean;
}

export const ScheduleList: React.FC<ScheduleListProps> = (props) => {
  return <ScheduledList {...props} />;
};

export interface UpcomingStats {
  total: number;
  pending: number;
  published: number;
  failed: number;
}

export interface UpcomingSummaryProps {
  stats: UpcomingStats;
}

export const UpcomingSummary: React.FC<UpcomingSummaryProps> = ({ stats }) => {
  return (
    <Card title="Tổng quan lịch đăng" subtitle="Thống kê 7 ngày tới">
      <div className="fb-stats-row">
        <div className="fb-stats-row__item">
          <span className="fb-stats-row__value">{stats.total}</span>
          <span className="fb-stats-row__label">Tổng cộng</span>
        </div>
        <div className="fb-stats-row__item">
          <Badge tone="brand">{stats.pending} chờ</Badge>
        </div>
        <div className="fb-stats-row__item">
          <Badge tone="success">{stats.published} đã đăng</Badge>
        </div>
        <div className="fb-stats-row__item">
          <Badge tone="danger">{stats.failed} thất bại</Badge>
        </div>
      </div>
    </Card>
  );
};

export default ScheduleList;
