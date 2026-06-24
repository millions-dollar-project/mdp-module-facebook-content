/**
 * BrainFeedEmpty — empty state shown when no Brain feed items exist yet.
 *
 * The CTA routes the user back to the Crawl tab via the parent's
 * `onGoToCrawl` callback (so the parent can manage tab switching).
 */
import React from 'react';

export interface BrainFeedEmptyProps {
  onGoToCrawl: () => void;
}

export const BrainFeedEmpty: React.FC<BrainFeedEmptyProps> = ({ onGoToCrawl }) => (
  <div
    data-testid="brain-feed-empty"
    style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 60, color: '#64748b', gap: 12,
    }}
  >
    <div style={{ fontSize: 48 }}>🧠</div>
    <p>Brain Feed trống — crawl trang Facebook trước.</p>
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
  </div>
);

export default BrainFeedEmpty;
