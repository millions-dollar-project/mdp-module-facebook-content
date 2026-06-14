import { useMemo } from 'react';
import { useFacebookApi } from './useFacebookApi';
import type { Conversation } from '../lib/types';

export const useConversations = (pageId: string | null): ReturnType<typeof useFacebookApi<Conversation[]>> => {
  const fallback = useMemo<Conversation[]>(() => [], []);

  return useFacebookApi<Conversation[]>(
    pageId ? `conversations?pageId=${encodeURIComponent(pageId)}` : null,
    fallback,
    { pollMs: 30000, fallbackOnError: false }
  );
};

export default useConversations;
