import React from 'react';
import { Card } from '../../components';

export interface BestTimesHeatmapProps {
  /** 7×4 matrix: rows = day-of-week, cols = hour bucket (8, 12, 18, 20). */
  data: number[][];
  labels?: { days?: string[]; slots?: string[] };
}

const DEFAULT_DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DEFAULT_SLOTS = ['08:00', '12:00', '18:00', '20:00'];

export const BestTimesHeatmap: React.FC<BestTimesHeatmapProps> = ({ data, labels }) => {
  const days = labels?.days ?? DEFAULT_DAYS;
  const slots = labels?.slots ?? DEFAULT_SLOTS;
  const max = Math.max(1, ...data.flat());

  return (
    <Card
      title="Khung giờ vàng"
      subtitle="Mật độ tương tác theo ngày trong tuần"
      className="fb-heatmap-card"
    >
      <div className="fb-heatmap">
        <div className="fb-heatmap__row fb-heatmap__row--head">
          <span className="fb-heatmap__corner" />
          {slots.map((s) => (
            <span key={s} className="fb-heatmap__head">{s}</span>
          ))}
        </div>
        {data.map((row, di) => (
          <div key={di} className="fb-heatmap__row">
            <span className="fb-heatmap__day">{days[di] ?? `D${di + 1}`}</span>
            {row.map((v, si) => {
              const pct = Math.round((v / max) * 100);
              const opacity = 0.15 + (pct / 100) * 0.85;
              return (
                <span
                  key={si}
                  className="fb-heatmap__cell"
                  style={{ background: `rgba(59, 130, 246, ${opacity})`, borderColor: `rgba(59, 130, 246, ${opacity + 0.2})` }}
                  title={`${days[di] ?? ''} ${slots[si] ?? ''}: ${v} tương tác`}
                >
                  {v > 0 ? v : ''}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
};

export const MOCK_HEATMAP_DATA: number[][] = [
  [12, 24, 38, 52],
  [15, 22, 41, 48],
  [18, 28, 45, 56],
  [22, 30, 48, 61],
  [20, 26, 42, 49],
  [25, 32, 38, 35],
  [16, 20, 28, 30],
];

export default BestTimesHeatmap;
