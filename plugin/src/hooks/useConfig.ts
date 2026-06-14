import { useFacebookApi } from './useFacebookApi';
import {
  MOCK_CONFIG,
  MOCK_HASHTAGS,
  MOCK_HISTORY,
  MOCK_PROMPTS,
  MOCK_TONES,
} from '../mocks';
import type {
  FacebookConfig,
  HashtagEntry,
  PostHistoryEntry,
  PromptTemplate,
  ContentTone,
  VideoConfig,
} from '../lib/types';

export const useConfig = (): ReturnType<typeof useFacebookApi<FacebookConfig>> => {
  return useFacebookApi<FacebookConfig>('config', MOCK_CONFIG);
};

export const usePostHistory = (): ReturnType<typeof useFacebookApi<PostHistoryEntry[]>> => {
  return useFacebookApi<PostHistoryEntry[]>('post-history', MOCK_HISTORY);
};

export const usePrompts = (): ReturnType<typeof useFacebookApi<PromptTemplate[]>> => {
  return useFacebookApi<PromptTemplate[]>('prompt-templates', MOCK_PROMPTS);
};

export const useHashtags = (): ReturnType<typeof useFacebookApi<HashtagEntry[]>> => {
  return useFacebookApi<HashtagEntry[]>('hashtags', MOCK_HASHTAGS);
};

export const useTones = (): ReturnType<typeof useFacebookApi<ContentTone[]>> => {
  return useFacebookApi<ContentTone[]>('tones', MOCK_TONES);
};

export const useVideoConfig = (): ReturnType<typeof useFacebookApi<VideoConfig>> => {
  return useFacebookApi<VideoConfig>('video-config', {
    watermarkType: 'none',
  });
};

export default useConfig;
