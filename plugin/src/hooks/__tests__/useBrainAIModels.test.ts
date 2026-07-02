/**
 * Tests for useBrainAIModels — specifically the envelope-shape tolerance
 * introduced after the runtime crash "Cannot read properties of
 * undefined (reading 'map')" inside SchedulePostModal:88.
 *
 * The Go backend historically returns the AI model list under a few
 * different keys (`data`, `models`, or as a bare array). The hook
 * must coerce any of those shapes — and never an undefined field — to
 * a real array, because SchedulePostModal:138 calls `models.map()` in
 * a `useMemo` and the parent `<Modal>` returns null on close but the
 * hooks (and therefore the useMemo) STILL run.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { expect, it, beforeEach, vi } from 'vitest';
import { useBrainAIModels } from '../useBrainAIModels';

const mockInvoke = vi.fn();
const w = window as any;

beforeEach(() => {
  mockInvoke.mockReset();
  w.mdp = { ipc: { invoke: mockInvoke } };
});

it('accepts { data: [...] } envelope', async () => {
  mockInvoke.mockResolvedValueOnce({
    data: [{ id: 'gpt-4o', label: 'GPT-4o' }],
  });
  const { result } = renderHook(() => useBrainAIModels());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.models).toEqual([{ id: 'gpt-4o', label: 'GPT-4o' }]);
  expect(result.current.error).toBeNull();
});

it('accepts { models: [...] } envelope (legacy shape)', async () => {
  mockInvoke.mockResolvedValueOnce({
    models: [{ id: 'claude', label: 'Claude' }],
  });
  const { result } = renderHook(() => useBrainAIModels());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.models).toEqual([{ id: 'claude', label: 'Claude' }]);
});

it('accepts a bare array', async () => {
  mockInvoke.mockResolvedValueOnce([{ id: 'gemini', label: 'Gemini' }]);
  const { result } = renderHook(() => useBrainAIModels());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.models).toEqual([{ id: 'gemini', label: 'Gemini' }]);
});

it('coerces an envelope without the list field to []', async () => {
  mockInvoke.mockResolvedValueOnce({});
  const { result } = renderHook(() => useBrainAIModels());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.models).toEqual([]);
});

it('coerces null to []', async () => {
  mockInvoke.mockResolvedValueOnce(null);
  const { result } = renderHook(() => useBrainAIModels());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.models).toEqual([]);
});
