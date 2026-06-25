/**
 * BrainPersonaPanel — list AI profiles known to the Brain MCP.
 *
 * Read-only for now: mdp-brain doesn't yet expose list_profiles. Until
 * it does, we fall back to QueryGraph(type=profile). When empty, the
 * panel renders an EmptyState so the UI doesn't pretend to have data.
 */
import React from 'react';
import { Card, EmptyState } from '../components';
import { useBrainPersonas } from '../hooks/useBrainPersonas';

export const BrainPersonaPanel: React.FC = () => {
  const { personas, loading, error } = useBrainPersonas();

  if (loading && personas.length === 0) {
    return (
      <Card padded>
        <div style={{ fontSize: 12, color: 'var(--ds-text-muted)' }}>
          Đang tải personas…
        </div>
      </Card>
    );
  }

  if (error && personas.length === 0) {
    return (
      <Card padded>
        <div style={{ fontSize: 12, color: 'var(--ds-danger)' }}>
          Lỗi tải personas: {error}
        </div>
      </Card>
    );
  }

  if (personas.length === 0) {
    return (
      <EmptyState
        title="Chưa có persona nào"
        subtitle="Brain chưa expose list_profiles; graph trả về rỗng."
      />
    );
  }

  return (
    <Card padded data-testid="brain-persona-panel">
      <h3
        style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--ds-text-muted)',
        }}
      >
        Personas ({personas.length})
      </h3>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginTop: 8,
        }}
      >
        {personas.map((p) => (
          <div
            key={p.id}
            style={{
              padding: 8,
              borderRadius: 4,
              background: 'var(--bg-elevated)',
            }}
          >
            <div
              style={{
                fontWeight: 500,
                color: 'var(--ds-text-primary)',
              }}
            >
              {p.external_ref ?? p.id}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ds-text-muted)',
              }}
            >
              {p.type} · {p.id}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default BrainPersonaPanel;
