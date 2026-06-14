import { useFacebookApi } from './useFacebookApi';
import { MOCK_ANALYTICS, MOCK_DAILY_STATS } from '../mocks';
import type { DailyStats, EngagementAnalytics } from '../lib/types';

export const useAnalytics = (
  range: '7d' | '30d' | '90d' = '30d'
): ReturnType<typeof useFacebookApi<EngagementAnalytics>> => {
  return useFacebookApi<EngagementAnalytics>(`analytics?range=${range}`, MOCK_ANALYTICS);
};

export const useDailyStats = (): ReturnType<typeof useFacebookApi<DailyStats[]>> => {
  return useFacebookApi<DailyStats[]>('daily-stats', MOCK_DAILY_STATS);
};

export default useAnalytics;
