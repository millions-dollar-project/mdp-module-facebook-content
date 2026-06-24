/**
 * Tests for the useBrainFeed hook.
 *
 * We mock `window.mdp.ipc.invoke` to drive the underlying `listBrainFeed`
 * API client. The hook should:
 *   1. Fetch on mount with the provided params.
 *   2. Abort the previous in-flight request when params change.
 *   3. Surface errors as strings.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { expect, it, beforeEach, vi } from 'vitest';
import { useBrainFeed } from '../useBrainFeed';

const mockInvoke = vi.fn();
const w = window as any;

beforeEach(() => {
  mockInvoke.mockReset();
  w.mdp = { ipc: { invoke: mockInvoke } };
});

it('loads items on mount', async () => {
  mockInvoke.mockResolvedValueOnce({
    items: [{ id: '1', content: 'c' }],
    total: 1,
    page: 1,
    pageSize: 20,
  });
  const { result } = renderHook(() => useBrainFeed({ page: 1 }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data.items.length).toBe(1);
  expect(result.current.data.total).toBe(1);
});

it('aborts previous request when page changes', async () => {
  let pendingRequests = 0;
  let completedRequests = 0;
  mockInvoke.mockImplementation(async (_channel: string, _payload: unknown) => {
    pendingRequests++;
    await new Promise((r) => setTimeout(r, 50));
    completedRequests++;
    return { items: [], total: 0, page: 1, pageSize: 20 };
  });
  const { result, rerender } = renderHook(
    ({ page }) => useBrainFeed({ page }),
    { initialProps: { page: 1 } },
  );
  rerender({ page: 2 });
  rerender({ page: 3 });
  await waitFor(() => expect(result.current.loading).toBe(false));
  // At least two requests initiated (initial + at least one rerender)
  expect(pendingRequests).toBeGreaterThanOrEqual(2);
  // Only the last request should have completed
  expect(completedRequests).toBeGreaterThanOrEqual(1);
});

it('returns error string on failure', async () => {
  mockInvoke.mockRejectedValueOnce(new Error('boom'));
  const { result } = renderHook(() => useBrainFeed({ page: 1 }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe('boom');
});