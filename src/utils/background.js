import { convertFileSrc } from '@tauri-apps/api/core';

export function isHttpsImageUrl(value = '') {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveBackgroundImageUrl(value = '') {
  if (!value) return '';
  if (value.startsWith('asset:') || value.startsWith('blob:') || value.startsWith('data:image/')) return value;
  if (isHttpsImageUrl(value)) return value;

  try {
    return convertFileSrc(value);
  } catch {
    return value;
  }
}
