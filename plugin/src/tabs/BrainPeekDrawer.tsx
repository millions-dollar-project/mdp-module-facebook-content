/**
 * BrainPeekDrawer — slide-out panel showing provenance + drafts for a
 * feed row, with feedback actions (approve / reject / edit).
 *
 * Renders as a Modal because the project does not yet ship a Drawer
 * primitive. The intent is the same: show the reasoning behind a
 * generated draft and let the user record a review decision.
 */
import React, { useState } from 'react';
import { Button, Modal, useToast } from '../components';
import { useBrainProvenance } from '../hooks/useBrainProvenance';
import { useBrainFeedback } from '../hooks/useBrainFeedback';
import type { BrainFeedItem } from '../lib/types/brain';

export interface BrainPeekDrawerProps {
  feed: BrainFeedItem | null;
  open: boolean;
  onClose: () => void;
  onFeedback?: () => void;
}

export const BrainPeekDrawer: React.FC<BrainPeekDrawerProps> = ({
  feed,
  open,
  onClose,
  onFeedback,
}) => {
  const feedId = feed?.id ?? '';
  const { data, loading, error } = useBrainProvenance(open ? feedId : '');
  const { submit, loading: submitting } = useBrainFeedback();
  const toast = useToast();
  const [editedText, setEditedText] = useState('');

  if (!feed) return null;

  const titleSnippet = (feed.content || '').slice(0, 80);

  const handleAction = async (
    action: 'approved' | 'rejected' | 'edited',
  ) => {
    const provenanceId = data?.provenance?.id;
    if (!provenanceId) {
      toast.error('Chưa có provenance — không ghi nhận được feedback');
      return;
    }
    try {
      await submit(provenanceId, action, {
        editedText: action === 'edited' ? editedText : undefined,
      });
      toast.success(`Đã ghi nhận: ${action}`);
      setEditedText('');
      onFeedback?.();
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Brain · ${titleSnippet}…`} size="lg">
      {loading && !data && (
        <div style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>
          Đang tải provenance…
        </div>
      )}
      {error && !data && (
        <div style={{ color: 'var(--ds-danger)', fontSize: 13 }}>
          Lỗi: {error}
        </div>
      )}
      {data && (
        <>
          <Section title="Trạng thái feed">
            <span>{feed.status}</span>
            {feed.brainContentId ? ` · brain: ${feed.brainContentId}` : ''}
          </Section>
          {data.feed && (
            <Section title="Nội dung gốc">
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  maxHeight: 120,
                  overflow: 'auto',
                  background: 'var(--bg-elevated)',
                  padding: 8,
                  borderRadius: 4,
                }}
              >
                {data.feed.content}
              </div>
            </Section>
          )}
          {data.provenance && (
            <Section title={`Provenance (${data.provenance.id})`}>
              Profile: {data.provenance.profile_id ?? '—'} v
              {data.provenance.profile_version ?? '—'}
              <br />
              Rules:{' '}
              {Array.isArray(data.provenance.rule_refs)
                ? data.provenance.rule_refs.length
                : 0}{' '}
              applied
              <br />
              Validation:{' '}
              {(data.provenance.validation as { status?: string })?.status ?? 'unknown'}
            </Section>
          )}
          {data.drafts.length > 0 && (
            <Section title={`Drafts (${data.drafts.length})`}>
              {data.drafts.map((d) => (
                <div
                  key={d.id}
                  style={{
                    padding: 8,
                    background: 'var(--bg-elevated)',
                    borderRadius: 4,
                    marginTop: 4,
                  }}
                >
                  <div style={{ fontSize: 12 }}>{d.content}</div>
                  {d.validationStatus && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--ds-text-muted)',
                        marginTop: 4,
                      }}
                    >
                      Validation: {d.validationStatus}
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}
          <Section title="Ghi nhận feedback">
            <textarea
              placeholder="(tùy chọn) Nội dung đã sửa — bắt buộc khi chọn Sửa & duyệt"
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              style={{
                width: '100%',
                minHeight: 60,
                padding: 8,
                fontSize: 12,
                background: 'var(--bg-surface)',
                color: 'var(--ds-text-primary)',
                border: '1px solid var(--ds-border)',
                borderRadius: 4,
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                loading={submitting}
                disabled={!data.provenance}
                onClick={() => handleAction('approved')}
              >
                Duyệt
              </Button>
              <Button
                variant="danger"
                loading={submitting}
                disabled={!data.provenance}
                onClick={() => handleAction('rejected')}
              >
                Từ chối
              </Button>
              <Button
                variant="ghost"
                loading={submitting}
                disabled={!data.provenance || !editedText.trim()}
                onClick={() => handleAction('edited')}
              >
                Sửa & duyệt
              </Button>
            </div>
            {!data.provenance && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--ds-text-muted)',
                  marginTop: 6,
                }}
              >
                Feed này chưa có provenance — không ghi nhận được feedback.
              </div>
            )}
          </Section>
        </>
      )}
    </Modal>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div style={{ marginBottom: 12 }}>
    <div
      style={{
        fontSize: 11,
        color: 'var(--ds-text-muted)',
        textTransform: 'uppercase',
        marginBottom: 4,
      }}
    >
      {title}
    </div>
    <div
      style={{
        fontSize: 13,
        color: 'var(--ds-text-primary)',
      }}
    >
      {children}
    </div>
  </div>
);

export default BrainPeekDrawer;
