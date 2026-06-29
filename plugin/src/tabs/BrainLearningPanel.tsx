/**
 * BrainLearningPanel — list proposed learning signals with Apply action.
 *
 * Read-write: clicking Áp dụng calls applyBrainLearning (stub until
 * mdp-brain ships apply). After success, `onApplied` is invoked so the
 * parent can refresh other panels.
 */
import React, { useState } from 'react';
import { Button, Card, EmptyState, useToast } from '../components';
import { useBrainLearning } from '../hooks/useBrainLearning';
import { applyBrainLearning } from '../lib/api/brain';

export interface BrainLearningPanelProps {
  onApplied?: () => void;
  accountId?: string;
}

export const BrainLearningPanel: React.FC<BrainLearningPanelProps> = ({ onApplied, accountId }) => {
  const { signals, loading, reload } = useBrainLearning({ accountId });
  const toast = useToast();
  const [applying, setApplying] = useState<string | null>(null);

  const handleApply = async (id: string) => {
    setApplying(id);
    try {
      const res = await applyBrainLearning(id);
      toast.success(
        res.note ? `Đã ghi nhận — ${res.note}` : 'Đã áp dụng',
      );
      reload();
      onApplied?.();
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(null);
    }
  };

  if (loading && signals.length === 0) {
    return (
      <Card padded>
        <div style={{ fontSize: 12, color: 'var(--ds-text-muted)' }}>Đang tải…</div>
      </Card>
    );
  }

  if (signals.length === 0) {
    return (
      <EmptyState
        title="Chưa có đề xuất nào"
        subtitle="Brain sẽ đề xuất cải thiện sau khi nhận feedback."
      />
    );
  }

  return (
    <Card padded data-testid="brain-learning-panel">
      <h3
        style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--ds-text-muted)',
        }}
      >
        Brain Suggestions ({signals.length})
      </h3>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginTop: 8,
        }}
      >
        {signals.map((s) => (
          <div
            key={s.id}
            style={{
              padding: 8,
              borderRadius: 4,
              background: 'var(--bg-elevated)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--ds-text-primary)',
                  }}
                >
                  {s.target_type}
                  {s.target_id ? `: ${s.target_id}` : ''}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--ds-text-muted)',
                  }}
                >
                  Confidence: {(s.confidence * 100).toFixed(0)}% · Impact: {s.impact_level}
                </div>
              </div>
              <Button
                size="sm"
                variant="primary"
                loading={applying === s.id}
                onClick={() => handleApply(s.id)}
              >
                Áp dụng
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default BrainLearningPanel;
