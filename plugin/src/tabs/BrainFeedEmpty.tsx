/**
 * BrainFeedEmpty — empty state shown when no Brain feed items exist yet.
 *
 * Composes the shared kit `EmptyState` for visual consistency across the
 * plugin. The CTA routes the user back to the Crawl tab via the parent's
 * `onGoToCrawl` callback (so the parent can manage tab switching).
 */
import React from 'react';
import { Button, EmptyState } from '../components';

export interface BrainFeedEmptyProps {
  onGoToCrawl: () => void;
}

export const BrainFeedEmpty: React.FC<BrainFeedEmptyProps> = ({ onGoToCrawl }) => (
  <EmptyState
    icon={<div style={{ fontSize: 48 }}>🧠</div>}
    title="Brain Feed trống"
    subtitle="Crawl trang Facebook trước."
    action={
      <Button variant="primary" onClick={onGoToCrawl}>
        Đi tới Crawl
      </Button>
    }
  />
);

export default BrainFeedEmpty;