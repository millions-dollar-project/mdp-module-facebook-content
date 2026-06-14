import React from 'react';
import { Card, EmptyState, Badge, Button } from '../../components';
import { formatRelative, formatNumber, truncate } from '../../lib/format';
import type { CrawledPost } from '../../lib/types';

export interface CrawledPostGridProps {
  posts: CrawledPost[];
  onImport?: (p: CrawledPost) => void;
  onSchedule?: (p: CrawledPost) => void;
  loading?: boolean;
}

export const CrawledPostGrid: React.FC<CrawledPostGridProps> = ({ posts, onImport, onSchedule, loading }) => {
  if (loading) return <Card title="Bài crawl"><p className="fb-muted">Đang tải…</p></Card>;
  if (posts.length === 0) {
    return <Card title="Bài crawl"><EmptyState title="Chưa có bài nào" subtitle="Bấm 'Crawl' trên một đối thủ để bắt đầu." /></Card>;
  }
  return (
    <Card title="Bài viết crawl" subtitle={`${posts.length} bài — chọn để import hoặc lên lịch repost`} padded={false}>
      <ul className="fb-crawled-grid">
        {posts.map((p) => (
          <li key={p.id} className="fb-crawled-card">
            {p.imageUrl && <img src={p.imageUrl} alt="" className="fb-crawled-card__img" />}
            <div className="fb-crawled-card__body">
              <div className="fb-crawled-card__head">
                <strong>{p.pageName}</strong>
                <span className="fb-muted">{formatRelative(p.publishedAt)}</span>
              </div>
              <p className="fb-crawled-card__content">{truncate(p.content, 90)}</p>
              <div className="fb-crawled-card__stats">
                <Badge tone="info">❤️ {formatNumber(p.likes)}</Badge>
                <Badge tone="warning">💬 {formatNumber(p.comments)}</Badge>
                <Badge tone="brand">↗ {formatNumber(p.shares)}</Badge>
                <Badge tone="success">Virality {(p.viralityScore * 100).toFixed(0)}%</Badge>
              </div>
              <div className="fb-crawled-card__actions">
                {onImport && <Button size="sm" variant="ghost" onClick={() => onImport(p)}>Import</Button>}
                {onSchedule && <Button size="sm" onClick={() => onSchedule(p)}>Lên lịch</Button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export default CrawledPostGrid;
