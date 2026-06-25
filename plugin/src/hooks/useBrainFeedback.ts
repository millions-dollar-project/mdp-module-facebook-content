/**
 * useBrainFeedback — mutation hook for recordBrainFeedback.
 *
 * No polling. Returns a `submit` callback that resolves to the MCP
 * result; surfaces loading + error state for UI to consume.
 */
import { useCallback, useState } from 'react';
import { recordBrainFeedback } from '../lib/api/brain';

export type FeedbackAction = 'approved' | 'rejected' | 'edited';

export interface UseBrainFeedbackOptions {
  editedText?: string;
  notes?: string;
  reasonTags?: string[];
}

export function useBrainFeedback() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (provenanceId: string, action: FeedbackAction, opts: UseBrainFeedbackOptions = {}) => {
      setLoading(true);
      setError(null);
      try {
        return await recordBrainFeedback(provenanceId, action, {
          editedText: opts.editedText,
          notes: opts.notes,
          reasonTags: opts.reasonTags,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { submit, loading, error };
}
