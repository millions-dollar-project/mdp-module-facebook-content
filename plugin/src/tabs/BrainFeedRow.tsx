/**
 * BrainFeedRow — one row in the Brain feed list.
 *
 * Compact row: checkbox + thumbnail + content preview + meta + × delete.
 * Used by `BrainFeedTab`. Selection state lives in the parent.
 */
import React from 'react';
import type { BrainFeedItem } from '../lib/types/brain';

export interface BrainFeedRowProps {
  post: BrainFeedItem;
  selected: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const BrainFeedRow: React.FC<BrainFeedRowProps> = ({ post, selected, onToggle, onDelete }) => {
  const thumb = post.fullPicture ?? post.thumbnailUrls?.[0] ?? post.mediaUrls[0];
  const preview = post.content.length > 120 ? post.content.slice(0, 120) + '…' : post.content;
  const ago = formatAgo(post.postedAt);
  return (
    <div
      data-testid={`brain-feed-row-${post.id}`}
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: 8,
        border: '1px solid var(--ds-border)',
        borderRadius: 6,
        background: selected ? 'rgba(74,144,226,0.08)' : 'var(--bg-surface)',
        fontSize: 13,
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(post.id)}
        aria-label={`Chọn bài ${post.permalink}`}
        data-testid={`row-checkbox-${post.id}`}
      />
      <div
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: 4,
          background: thumb
            ? `url(${thumb}) center/cover no-repeat`
            : 'linear-gradient(135deg, #4a90e2, #a78bfa)',
        }}
      />
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
          <span>{post.pageName ?? post.pageId}</span>
          <span>·</span>
          <span>{ago}</span>
          <span>·</span>
          <span>👍 {post.likes}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(post.id)}
        aria-label="Xoá"
        style={{
          fontSize: 11,
          padding: '2px 6px',
          borderRadius: 3,
          border: '1px solid #fecaca',
          background: '#fef2f2',
          color: '#dc2626',
          cursor: 'pointer',
        }}
      >
        ×
      </button>
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

export default BrainFeedRow;
