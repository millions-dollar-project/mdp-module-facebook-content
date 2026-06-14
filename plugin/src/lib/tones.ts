/**
 * Builtin content tone catalog — matches social-content-automation logic.
 * Custom tones are stored in facebook.config.custom_content_tones JSON.
 */

import type { ContentTone } from './types';

export const BUILTIN_TONES: ContentTone[] = [
  { id: 'viral', name: 'Viral / Hook mạnh', description: 'Hook gây chú ý mạnh, tranh cãi nhẹ, kích thích chia sẻ, emoji chiến lược', isCustom: false },
  { id: 'professional', name: 'Chuyên nghiệp', description: 'Uy tín chuyên gia, insight ngành, ngôn ngữ chuẩn mực, ít emoji', isCustom: false },
  { id: 'storytelling', name: 'Kể chuyện', description: 'Narrative cá nhân hoặc dự án, có cao trào, gần gũi, dễ đồng cảm', isCustom: false },
  { id: 'emotional', name: 'Cảm xúc', description: 'Chạm cảm xúc phụ huynh, empathy, ấm áp, tin cậy', isCustom: false },
  { id: 'educational', name: 'Giáo dục', description: 'Tips/checklist hữu ích, dễ áp dụng, mang lại giá trị thực', isCustom: false },
];

export const DEFAULT_ENABLED_TONE_IDS = BUILTIN_TONES.map((t) => t.id);

export function buildTones(customJson: string): ContentTone[] {
  let customs: ContentTone[] = [];
  try {
    customs = JSON.parse(customJson || '[]');
  } catch { /* ignore */ }
  return [...BUILTIN_TONES, ...customs];
}

export function enabledTones(enabledJson: string): string[] {
  try {
    const arr = JSON.parse(enabledJson || '[]');
    if (Array.isArray(arr) && arr.length) return arr;
  } catch { /* ignore */ }
  return [...DEFAULT_ENABLED_TONE_IDS];
}

export function toggleToneId(current: string[], id: string, on: boolean): string[] {
  const set = new Set(current);
  if (on) set.add(id);
  else set.delete(id);
  return Array.from(set);
}

export function addCustomTone(current: ContentTone[], name: string, description: string): ContentTone[] {
  const id = `custom_${Date.now()}`;
  return [...current, { id, name, description, isCustom: true }];
}

export function deleteCustomTone(current: ContentTone[], id: string): ContentTone[] {
  return current.filter((t) => t.id !== id);
}

export function updateCustomTone(current: ContentTone[], id: string, name: string, description: string): ContentTone[] {
  return current.map((t) => (t.id === id ? { ...t, name, description } : t));
}

export function customsToJson(tones: ContentTone[]): string {
  return JSON.stringify(tones.filter((t) => t.isCustom));
}
