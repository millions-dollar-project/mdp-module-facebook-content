/**
 * Tests for useScheduledPosts — specifically the envelope-shape
 * tolerance introduced after the runtime crash "rows is not iterable"
 * inside KanbanTab:144 (the `for (const r of rows)` useMemo).
 *
 * Same root cause as the earlier useBrainAIModels crash: the wire
 * response is typed {data: ScheduleRow[]} and res.data is passed
 * straight to setRows. If the backend returns {rows: [...]} or a bare
 * array, res.data is undefined → consumer crashes on iter.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { expect, it, beforeEach, vi } from 'vitest';
import { useScheduledPosts } from '../useScheduledPosts';

const mockInvoke = vi.fn();
const w = window as any;

beforeEach(() => {
  mockInvoke.mockReset();
  w.mdp = { ipc: { invoke: mockInvoke } };
});

it('accepts { data: [...] } envelope', async () => {
  mockInvoke.mockResolvedValueOnce({
    data: [{ id: 'sp-1', status: 'SCHEDULED' }],
  });
  const { result } = renderHook(() => useScheduledPosts({}));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rows).toEqual([{ id: 'sp-1', status: 'SCHEDULED' }]);
  expect(result.current.error).toBeNull();
});

it('accepts { rows: [...] } envelope (legacy shape)', async () => {
  mockInvoke.mockResolvedValueOnce({
    rows: [{ id: 'sp-2', status: 'PUBLISHED' }],
  });
  const { result } = renderHook(() => useScheduledPosts({}));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rows).toEqual([{ id: 'sp-2', status: 'PUBLISHED' }]);
});

it('accepts { posts: [...] } envelope (mild drift)', async () => {
  mockInvoke.mockResolvedValueOnce({
    posts: [{ id: 'sp-3', status: 'FAILED' }],
  });
  const { result } = renderHook(() => useScheduledPosts({}));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rows).toEqual([{ id: 'sp-3', status: 'FAILED' }]);
});

it('accepts a bare array', async () => {
  mockInvoke.mockResolvedValueOnce([{ id: 'sp-4', status: 'CANCELLED' }]);
  const { result } = renderHook(() => useScheduledPosts({}));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rows).toEqual([{ id: 'sp-4', status: 'CANCELLED' }]);
});

it('coerces an envelope without the list field to []', async () => {
  mockInvoke.mockResolvedValueOnce({});
  const { result } = renderHook(() => useScheduledPosts({}));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rows).toEqual([]);
});

it('coerces null to []', async () => {
  mockInvoke.mockResolvedValueOnce(null);
  const { result } = renderHook(() => useScheduledPosts({}));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rows).toEqual([]);
});
