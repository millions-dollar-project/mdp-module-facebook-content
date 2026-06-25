/**
 * Tests for useBrainOverview polling + abort behavior.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/api/brain', () => ({
  fetchBrainOverview: vi.fn(),
}));

import { fetchBrainOverview } from '../../lib/api/brain';
import { useBrainOverview } from '../useBrainOverview';

const mockedFetch = vi.mocked(fetchBrainOverview);

const makeOverview = () => ({
  feeds: { ingested: 5, generated: 2 },
  drafts: { pending: 1 },
  brain: {
    total_memories: 10,
    total_rules: 3,
    total_profiles: 1,
    total_learning_signals: 4,
  },
  graph: { total_entities: 7, by_type: { page: 5 } },
  recent_7d: { ingests: 5, generates: 2, publishes: 1, feedback_count: 3 },
});

beforeEach(() => {
  mockedFetch.mockReset();
  (window as unknown as { mdp?: unknown }).mdp = undefined;
});

describe('useBrainOverview', () => {
  it('loads overview on mount', async () => {
    mockedFetch.mockResolvedValue(makeOverview() as never);
    const { result } = renderHook(() => useBrainOverview({ pollIntervalMs: 0 }));
    await waitFor(() => expect(result.current.data?.feeds.ingested).toBe(5));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('exposes error state when fetch throws', async () => {
    mockedFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBrainOverview({ pollIntervalMs: 0 }));
    await waitFor(() => expect(result.current.error).toBe('boom'));
  });

  it('skips fetch when disabled', async () => {
    mockedFetch.mockResolvedValue(makeOverview() as never);
    renderHook(() => useBrainOverview({ enabled: false }));
    // No waitFor — disabled hooks should not call fetchBrainOverview.
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
