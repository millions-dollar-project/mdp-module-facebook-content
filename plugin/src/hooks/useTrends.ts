import { useFacebookApi } from './useFacebookApi';
import { MOCK_TRENDS } from '../mocks';
import type { Trend } from '../lib/types';

export const useTrends = (): ReturnType<typeof useFacebookApi<Trend[]>> => {
  return useFacebookApi<Trend[]>('trends', MOCK_TRENDS);
};

export default useTrends;
