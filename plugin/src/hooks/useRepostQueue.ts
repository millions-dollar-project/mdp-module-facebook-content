/**
 * useRepostQueue — read the cross-campaign queue view, reschedule jobs,
 * and toggle per-job auto / anonymous flags. The queue view is the
 * "waiting list with editable time per post" that the SCA port needs.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fbFetch } from '../lib/api';
import { isInPast } from '../lib/time';
import type { QueueFilter, RepostJob } from '../lib/types';

export interface UseRepostQueueState {
  jobs: RepostJob[];
  loading: boolean;
  error: string | null;
  /** Force a refetch; returns the promise so callers can await. */
  refresh: () => Promise<void>;
  /** Reschedule a job. Rejects with the server error message on failure. */
  reschedule: (jobId: string, when: Date) => Promise<void>;
  /** Toggle auto / anonymous flags; preserves the existing schedule. */
  setFlags: (jobId: string, autoEnabled: boolean, anonymousPosting: boolean) => Promise<void>;
}

export function useRepostQueue(filter: QueueFilter = {}): UseRepostQueueState {
  const query = useMemo(() => buildQuery(filter), [filter]);
  const [jobs, setJobs] = useState<RepostJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fbFetch<RepostJob[]>(`repost-queue?${query}`);
      setJobs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const reschedule = useCallback(
    async (jobId: string, when: Date) => {
      if (isInPast(when)) {
        throw new Error('Không thể lên lịch giờ đã qua');
      }
      await fbFetch(`repost-jobs/${jobId}/reschedule`, {
        method: 'POST',
        body: { scheduledAt: when.toISOString() },
      });
      await refresh();
    },
    [refresh],
  );

  const setFlags = useCallback(
    async (jobId: string, autoEnabled: boolean, anonymousPosting: boolean) => {
      const current = jobs.find((j) => j.id === jobId);
      await fbFetch(`repost-jobs/${jobId}/flags`, {
        method: 'POST',
        body: {
          autoEnabled,
          anonymousPosting,
          scheduledAt: current?.scheduledAt ?? '',
        },
      });
      await refresh();
    },
    [jobs, refresh],
  );

  return { jobs, loading, error, refresh, reschedule, setFlags };
}

function buildQuery(f: QueueFilter): string {
  const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.accountId) p.set('accountId', f.accountId);
  if (f.groupId) p.set('groupId', f.groupId);
  if (f.limit) p.set('limit', String(f.limit));
  return p.toString();
}
