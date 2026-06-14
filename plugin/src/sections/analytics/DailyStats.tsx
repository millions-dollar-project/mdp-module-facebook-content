import React from 'react';
import { Card } from '../../components';
import { formatNumber } from '../../lib/format';
import type { DailyStats } from '../../lib/types';

export interface DailyStatsViewProps {
  data: DailyStats[];
  loading?: boolean;
}

export const DailyStatsView: React.FC<DailyStatsViewProps> = ({ data, loading }) => {
  if (loading) return <Card title="Thống kê ngày"><p className="fb-muted">Đang tải…</p></Card>;
  return (
    <Card title="Thống kê 14 ngày" subtitle="Hoạt động theo ngày" padded={false}>
      <table className="fb-stats-table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Đã đăng</th>
            <th>Đã lên lịch</th>
            <th>Lỗi</th>
            <th>AI replies</th>
            <th>Tin nhắn</th>
            <th>Reach</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td className="fb-mono">{d.date}</td>
              <td>{formatNumber(d.postsPublished)}</td>
              <td>{formatNumber(d.postsScheduled)}</td>
              <td>{d.postsFailed > 0 ? <span className="fb-error">{formatNumber(d.postsFailed)}</span> : '0'}</td>
              <td>{formatNumber(d.aiReplies)}</td>
              <td>{formatNumber(d.messagesReplied)}</td>
              <td>{formatNumber(d.totalReach)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

export default DailyStatsView;
