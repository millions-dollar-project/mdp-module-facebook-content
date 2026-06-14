import { useFacebookApi } from './useFacebookApi';
import { MOCK_CRAWLED, MOCK_COMPETITORS } from '../mocks';
import type { Competitor, CrawledPost } from '../lib/types';

export const useCrawledPosts = (): ReturnType<typeof useFacebookApi<CrawledPost[]>> => {
  return useFacebookApi<CrawledPost[]>('crawled-posts', MOCK_CRAWLED);
};

export const useCompetitors = (): ReturnType<typeof useFacebookApi<Competitor[]>> => {
  return useFacebookApi<Competitor[]>('competitors', MOCK_COMPETITORS);
};

export default useCrawledPosts;
