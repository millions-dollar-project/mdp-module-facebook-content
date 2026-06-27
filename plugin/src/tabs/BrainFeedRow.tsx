/**
 * BrainFeedRow — one row in the Brain feed list.
 *
 * Compact row: checkbox + thumbnail + content preview + meta + × delete.
 * Used by `BrainFeedTab`. Selection state lives in the parent.
 */
import React from 'react';
import { Button } from '../components';
import type { BrainFeedItem } from '../lib/types/brain';

export interface BrainFeedRowProps {
  post: BrainFeedItem;
  selected: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onPeek?: (id: string) => void;
}

const BrainFeedRowInner: React.FC<BrainFeedRowProps> = ({
  post,
  selected,
  onToggle,
  onDelete,
  onPeek,
}) => {
  // BrainFeedItem is typed PascalCase to match the Go backend wire format
  // (see `lib/types/brain.ts`). MediaURLs / Content / PostedAt etc. arrive
  // with their original casing. Defensive `?? []` covers rows that lack any
  // attachments (no media URLs).
  const mediaUrls: readonly string[] = post.MediaURLs ?? [];
  const thumb = post.FullPicture ?? post.ThumbnailURLs?.[0] ?? mediaUrls[0];
  const preview = post.Content.length > 120 ? post.Content.slice(0, 120) + '…' : post.Content;
  const ago = formatAgo(post.PostedAt);
  return (
    <div
      data-testid={`brain-feed-row-${post.ID}`}
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: 8,
        border: '1px solid var(--ds-border)',
        borderRadius: 6,
        background: selected
          ? 'color-mix(in srgb, var(--platform-accent) 10%, transparent)'
          : 'var(--bg-surface)',
        fontSize: 13,
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(post.ID)}
        aria-label={`Chọn bài ${post.Permalink}`}
        data-testid={`row-checkbox-${post.ID}`}
      />
      <div
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: 4,
          background: thumb
            ? `url(${thumb}) center/cover no-repeat`
            : 'linear-gradient(135deg, var(--platform-accent), var(--platform-accent-strong))',
        }}
      />
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--ds-text-muted)', marginTop: 2 }}>
          <span>{post.PageName ?? post.PageID}</span>
          <span>·</span>
          <span>{ago}</span>
          <span>·</span>
          <span>👍 {post.Likes}</span>
        </div>
      </div>
      {onPeek && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPeek(post.ID)}
          aria-label="Brain peek"
          data-testid={`row-peek-${post.ID}`}
          style={{
            padding: '2px 8px',
            minWidth: 'auto',
            color: 'var(--ds-text-muted)',
            border: '1px solid var(--ds-border)',
          }}
        >
          Brain
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onDelete(post.ID)}
        aria-label="Xoá"
        data-testid={`row-delete-${post.ID}`}
        style={{
          padding: '2px 6px',
          minWidth: 'auto',
          color: 'var(--platform-accent)',
          border: '1px solid var(--ds-border)',
        }}
      >
        ×
      </Button>
    </div>
  );
};

function formatAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export const BrainFeedRow = React.memo(BrainFeedRowInner);
export default BrainFeedRow;