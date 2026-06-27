/**
 * Tests for BrainFeedRow.
 *
 * BrainFeedRow is a pure presentational component: it renders a row and
 * delegates user actions via callbacks. We stub the IPC bridge so the
 * hook imports in BrainFeedTab don't blow up when running this single
 * test in isolation.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi, beforeEach } from 'vitest';
import { BrainFeedRow } from './BrainFeedRow';
import type { BrainFeedItem } from '../lib/types/brain';

const basePost: BrainFeedItem = {
  ID: 'feed-1',
  CrawledPostID: 'u1',
  PageID: 'p1',
  PageName: 'Tech VN',
  Content: 'Aula F75 Silent deal — chiếc bàn phím êm nhất năm nay đã lên kệ',
  MediaURLs: [],
  VideoURLs: [],
  MediaType: 'text',
  Likes: 1200,
  Comments: 89,
  Shares: 45,
  PostedAt: new Date(Date.now() - 3600_000).toISOString(),
  SourceURL: 'https://facebook.com/...',
  Permalink: 'https://facebook.com/...',
  IngestedAt: new Date().toISOString(),
  Status: 'ingested',
};

beforeEach(() => {
  // Provide a stub IPC so any indirect hook imports don't blow up.
  (window as unknown as { mdp?: unknown }).mdp = {
    ipc: { invoke: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }) },
  };
});

it('renders preview, pageName, likes', () => {
  render(<BrainFeedRow post={basePost} selected={false} onToggle={() => {}} onDelete={() => {}} />);
  expect(screen.getByText(/Aula F75/)).toBeInTheDocument();
  expect(screen.getByText(/Tech VN/)).toBeInTheDocument();
  expect(screen.getByText(/👍 1200/)).toBeInTheDocument();
});

it('calls onToggle when checkbox clicked', () => {
  const onToggle = vi.fn();
  render(<BrainFeedRow post={basePost} selected={false} onToggle={onToggle} onDelete={() => {}} />);
  fireEvent.click(screen.getByTestId('row-checkbox-feed-1'));
  expect(onToggle).toHaveBeenCalledWith('feed-1');
});

it('calls onDelete when × clicked', () => {
  const onDelete = vi.fn();
  render(<BrainFeedRow post={basePost} selected={false} onToggle={() => {}} onDelete={onDelete} />);
  fireEvent.click(screen.getByRole('button', { name: /xoá/i }));
  expect(onDelete).toHaveBeenCalledWith('feed-1');
});

it('truncates long content with ellipsis', () => {
  const long: BrainFeedItem = { ...basePost, Content: 'a'.repeat(200) };
  render(<BrainFeedRow post={long} selected={false} onToggle={() => {}} onDelete={() => {}} />);
  const text = screen.getByText(/…$/);
  expect(text.textContent!.length).toBeLessThanOrEqual(121);
});
