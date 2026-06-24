/**
 * BrainFeedEmpty — empty state shown when no Brain feed items exist yet.
 *
 * Composes the shared kit `EmptyState` for visual consistency across the
 * plugin. The CTA routes the user back to the Crawl tab via the parent's
 * `onGoToCrawl` callback (so the parent can manage tab switching).
 */
import React from 'react';
import { EmptyState } from '../components';

export interface BrainFeedEmptyProps {
  onGoToCrawl: () => void;
}

export const BrainFeedEmpty: React.FC<BrainFeedEmptyProps> = ({ onGoToCrawl }) => (
  <EmptyState
    icon={<div style={{ fontSize: 48 }}>🧠</div>}
    title="Brain Feed trống"
    subtitle="Crawl trang Facebook trước."
    action={
      <button
        type="button"
        onClick={onGoToCrawl}
        style={{
          padding: '8px 16px', borderRadius: 4, border: 'none',
          background: '#4a90e2', color: '#fff', cursor: 'pointer',
        }}
      >
        Đi tới Crawl
      </button>
    }
  />
);

export default BrainFeedEmpty;
