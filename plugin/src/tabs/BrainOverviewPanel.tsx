/**
 * BrainOverviewPanel — top section of the Brain Feed dashboard.
 *
 * Surfaces aggregated Brain stats: total memories / rules / profiles /
 * graph entities; per-status counts of feeds + drafts; and the 7-day
 * activity line. Data is fetched + polled (30s) by useBrainOverview.
 *
 * Tokens: this file uses kit tokens exclusively (--platform-accent,
 * --ds-text-muted, --bg-elevated) so it matches the rest of the
 * Brain Feed UI per the T14 refactor.
 */
import React from 'react';
import { Card } from '../components';
import { useBrainOverview } from '../hooks/useBrainOverview';

export interface BrainOverviewPanelProps {
  accountId?: string;
}

export const BrainOverviewPanel: React.FC<BrainOverviewPanelProps> = ({ accountId }) => {
  const { data, loading, error } = useBrainOverview({ accountId });

  if (loading && !data) {
    return (
      <Card padded>
        <div style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>
          Đang tải Brain overview{accountId ? ` cho account…` : '…'}
        </div>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card padded>
        <div style={{ color: 'var(--ds-danger)', fontSize: 13 }}>
          Không tải được Brain overview: {error}
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const totalFeeds = sum(data.feeds);
  const totalDrafts = sum(data.drafts);

  return (
    <Card padded data-testid="brain-overview-panel">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        <Stat label="Memories" value={data.brain.total_memories} />
        <Stat label="Rules" value={data.brain.total_rules} />
        <Stat label="Profiles" value={data.brain.total_profiles} />
        <Stat label="Graph entities" value={data.graph.total_entities} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 12,
          marginTop: 12,
        }}
      >
        <Distribution label="Feeds theo trạng thái" data={data.feeds} total={totalFeeds} />
        <Distribution label="Drafts theo trạng thái" data={data.drafts} total={totalDrafts} />
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          color: 'var(--ds-text-muted)',
        }}
      >
        7 ngày qua: {data.recent_7d.ingests} ingests · {data.recent_7d.generates} generates
        · {data.recent_7d.publishes} publishes · {data.recent_7d.feedback_count} feedback
      </div>
      {data.warnings && data.warnings.length > 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--ds-text-muted)',
          }}
        >
          ⚠️ {data.warnings.length} cảnh báo từ Brain
        </div>
      )}
    </Card>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div
    style={{
      padding: 12,
      borderRadius: 6,
      background: 'var(--bg-elevated)',
    }}
  >
    <div style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>{label}</div>
    <div
      style={{
        fontSize: 24,
        fontWeight: 600,
        color: 'var(--ds-text-primary)',
      }}
    >
      {value}
    </div>
  </div>
);

const Distribution: React.FC<{
  label: string;
  data: Record<string, number>;
  total: number;
}> = ({ label, data, total }) => {
  const entries = Object.entries(data);
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 6,
        background: 'var(--bg-elevated)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--ds-text-muted)',
          marginBottom: 6,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        <span>tổng: {total}</span>
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>
          Chưa có dữ liệu
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2px 8px',
          }}
        >
          {entries.map(([status, count]) => (
            <div
              key={status}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: 'var(--ds-text-muted)' }}>{status}</span>
              <span style={{ color: 'var(--ds-text-primary)', fontWeight: 500 }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const sum = (rec: Record<string, number>): number =>
  Object.values(rec).reduce((a, b) => a + b, 0);

export default BrainOverviewPanel;
