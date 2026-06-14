import { useFacebookApi } from './useFacebookApi';
import type { Message } from '../lib/types';

export const useMessages = (
  conversationId: string | null
): ReturnType<typeof useFacebookApi<Message[]>> => {
  return useFacebookApi<Message[]>(
    conversationId ? `conversations/${encodeURIComponent(conversationId)}/messages` : null,
    [],
    { pollMs: 8000 }
  );
};

export default useMessages;
