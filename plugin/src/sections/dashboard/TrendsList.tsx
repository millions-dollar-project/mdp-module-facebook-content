import React from 'react';
import { Card, Tabs, EmptyState, Badge } from '../../components';
import { formatRelative, truncate } from '../../lib/format';
import type { Trend } from '../../lib/types';

const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'ACTIVE', label: 'Đang hot' },
  { id: 'EMERGING', label: 'Đang lên' },
  { id: 'PEAK', label: 'Đỉnh' },
  { id: 'FADING', label: 'Đang tàn' },
] as const;

type Filter = (typeof FILTERS)[number]['id'];

const statusTone: Record<Trend['status'], 'success' | 'brand' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  EMERGING: 'brand',
  PEAK: 'warning',
  FADING: 'neutral',
};

export interface TrendsListProps {
  trends: Trend[];
  onGenerate?: (t: Trend) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export const TrendsList: React.FC<TrendsListProps> = ({ trends, onGenerate, onRefresh, loading }) => {
  const [filter, setFilter] = React.useState<Filter>('all');
  const list = filter === 'all' ? trends : trends.filter((t) => t.status === filter);
  return (
    <Card
      title="Xu hướng nội dung"
      subtitle="Crawl từ các trang đối thủ + phân tích AI"
      actions={onRefresh ? <button type="button" className="fb-btn fb-btn--sm fb-btn--ghost" onClick={onRefresh}>↻ Làm mới</button> : undefined}
      padded={false}
    >
      <div className="fb-trends__tabs">
        <Tabs items={FILTERS as unknown as { id: string; label: React.ReactNode }[]} value={filter} onChange={(v) => setFilter(v as Filter)} size="sm" />
      </div>
      {loading ? (
        <p className="fb-muted">Đang tải…</p>
      ) : list.length === 0 ? (
        <EmptyState title="Chưa có xu hướng" subtitle="Bấm 'Làm mới' để crawl lại." />
      ) : (
        <div className="fb-trends-list">
          {list.map((t) => (
            <article key={t.id} className="fb-trend-card">
              <div className="fb-trend-card__head">
                <h4 className="fb-trend-card__topic">{t.topic}</h4>
                <div className="fb-trend-card__badges">
                  <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                  <Badge tone="info">Score {t.score}</Badge>
                </div>
              </div>
              <p className="fb-trend-card__summary">{truncate(t.summary, 120)}</p>
              <div className="fb-trend-card__meta">
                <span className="fb-muted">{formatRelative(t.discoveredAt)}</span>
              </div>
              <div className="fb-trend-card__keywords">
                {t.keywords.map((k) => (
                  <span key={k} className="fb-keyword">{k}</span>
                ))}
              </div>
              {onGenerate && (
                <div className="fb-trend-card__actions">
                  <button type="button" className="fb-btn fb-btn--sm fb-btn--primary" onClick={() => onGenerate(t)}>
                    ✨ Sinh nội dung
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
};

export default TrendsList;
