/**
 * BrainFeedPagination — compact "‹ 1 2 3 … N ›" pager for the Brain feed list.
 *
 * Uses a compact page list (1, ±1 around current, last) with `…` gaps so
 * the control stays small even with hundreds of pages.
 */
import React from 'react';

export interface BrainFeedPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export const BrainFeedPagination: React.FC<BrainFeedPaginationProps> = ({ page, pageSize, total, onPageChange }) => {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const pages = compactPages(page, last);
  return (
    <nav
      aria-label="Pagination"
      data-testid="brain-feed-pagination"
      style={{ display: 'flex', gap: 4, justifyContent: 'center', padding: 12, fontSize: 13 }}
    >
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Trang trước"
      >
        ‹
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} style={{ padding: '4px 6px', color: 'var(--ds-text-muted)' }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Trang ${p}`}
            style={{
              padding: '4px 8px',
              borderRadius: 3,
              border: '1px solid var(--ds-border)',
              background: p === page ? 'var(--platform-accent)' : 'transparent',
              color: p === page ? 'var(--ds-text-inverse)' : 'inherit',
            }}
          >
            {p}
          </button>
        )
      )}
      <button
        disabled={page >= last}
        onClick={() => onPageChange(page + 1)}
        aria-label="Trang sau"
      >
        ›
      </button>
    </nav>
  );
};

function compactPages(curr: number, last: number): (number | '…')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (curr > 3) out.push('…');
  for (let p = Math.max(2, curr - 1); p <= Math.min(last - 1, curr + 1); p++) out.push(p);
  if (curr < last - 2) out.push('…');
  out.push(last);
  return out;
}

export default BrainFeedPagination;