import React from 'react';
import { Card } from '../../components';
import { formatNumber } from '../../lib/format';
import type { EngagementAnalytics } from '../../lib/types';

export interface EngagementChartProps {
  data: EngagementAnalytics;
}

export const EngagementChart: React.FC<EngagementChartProps> = ({ data }) => {
  const max = Math.max(1, ...data.series.map((s) => s.likes + s.comments + s.shares));
  return (
    <Card title="Tương tác 30 ngày" subtitle="Like + comment + share theo ngày">
      <div className="fb-chart" role="img" aria-label="Engagement chart">
        {data.series.map((d) => {
          const total = d.likes + d.comments + d.shares;
          const h = Math.max(2, (total / max) * 100);
          return (
            <div key={d.date} className="fb-chart__col" title={`${d.date}: ${formatNumber(total)}`}>
              <div className="fb-chart__bar" style={{ height: `${h}%` }}>
                <div className="fb-chart__bar-likes" style={{ height: `${(d.likes / total) * 100}%` }} />
                <div className="fb-chart__bar-comments" style={{ height: `${(d.comments / total) * 100}%` }} />
                <div className="fb-chart__bar-shares" style={{ height: `${(d.shares / total) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="fb-chart__legend">
        <span><i className="fb-chart__dot fb-chart__dot--likes" /> Like</span>
        <span><i className="fb-chart__dot fb-chart__dot--comments" /> Comment</span>
        <span><i className="fb-chart__dot fb-chart__dot--shares" /> Share</span>
      </div>
    </Card>
  );
};

export default EngagementChart;
