/**
 * BrainGraphStats — aggregate counts over the Brain entity graph.
 *
 * Stats only (per design D7): no full graph view. Top-5 entities
 * provide just enough context to spot what's tracked.
 */
import React from 'react';
import { Card, EmptyState } from '../components';
import { useBrainGraph } from '../hooks/useBrainGraph';

export const BrainGraphStats: React.FC = () => {
  const { data, loading, error } = useBrainGraph();

  if (loading && !data) {
    return (
      <Card padded>
        <div style={{ fontSize: 12, color: 'var(--ds-text-muted)' }}>
          Đang tải graph…
        </div>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card padded>
        <div style={{ fontSize: 12, color: 'var(--ds-danger)' }}>
          Lỗi tải graph: {error}
        </div>
      </Card>
    );
  }

  if (!data || data.total_entities === 0) {
    return (
      <EmptyState
        title="Graph rỗng"
        subtitle="Chưa có entity nào được track."
      />
    );
  }

  return (
    <Card padded data-testid="brain-graph-stats">
      <h3
        style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--ds-text-muted)',
        }}
      >
        Graph ({data.total_entities})
      </h3>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          marginTop: 8,
          fontSize: 12,
        }}
      >
        {Object.entries(data.by_type).map(([type, count]) => (
          <div
            key={type}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{type}</span>
            <span
              style={{
                color: 'var(--ds-text-primary)',
                fontWeight: 500,
              }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>
      {data.top_entities.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 8,
            borderTop: '1px solid var(--ds-border)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--ds-text-muted)',
              marginBottom: 4,
            }}
          >
            Top entities
          </div>
          {data.top_entities.slice(0, 5).map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
              }}
            >
              <span
                style={{
                  color: 'var(--platform-accent)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {e.external_ref || e.id}
              </span>
              <span style={{ color: 'var(--ds-text-muted)' }}>{e.type}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default BrainGraphStats;
