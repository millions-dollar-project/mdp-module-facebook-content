import { useFacebookApi } from './useFacebookApi';
import { MOCK_SCHEDULED } from '../mocks';
import type { ScheduledPost } from '../lib/types';

export const useScheduler = (): ReturnType<typeof useFacebookApi<ScheduledPost[]>> => {
  return useFacebookApi<ScheduledPost[]>('scheduled-posts', MOCK_SCHEDULED, { pollMs: 30000 });
};

export default useScheduler;
