import { useFacebookApi } from './useFacebookApi';
import { MOCK_QUEUE } from '../mocks';
import type { QueueItem } from '../lib/types';

export const useQueue = (): ReturnType<typeof useFacebookApi<QueueItem[]>> => {
  return useFacebookApi<QueueItem[]>('content-queue', MOCK_QUEUE);
};

export default useQueue;
