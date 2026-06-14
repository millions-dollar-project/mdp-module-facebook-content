import { useFacebookApi } from './useFacebookApi';
import { MOCK_PAGE_SETTINGS } from '../mocks';
import type { FacebookPage, PageSettings } from '../lib/types';

export const usePages = (): ReturnType<typeof useFacebookApi<FacebookPage[]>> => {
  return useFacebookApi<FacebookPage[]>('pages', [], { fallbackOnError: false });
};

export const usePageSettings = (): ReturnType<typeof useFacebookApi<PageSettings[]>> => {
  return useFacebookApi<PageSettings[]>('page-settings', MOCK_PAGE_SETTINGS);
};

export default usePages;
