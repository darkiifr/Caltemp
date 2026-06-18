import { BaseDirectory, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

export const SOUND_STORAGE_DIR = 'sounds';

const cleanFileName = (name = 'son.wav') => {
  const fallback = 'son.wav';
  const base = String(name).split(/[\\/]/).pop() || fallback;
  const dot = base.lastIndexOf('.');
  const rawName = dot > 0 ? base.slice(0, dot) : base;
  const rawExt = dot > 0 ? base.slice(dot + 1) : 'wav';
  const safeName = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'son';
  const safeExt = rawExt.toLocaleLowerCase('fr-FR').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'wav';
  return `${safeName}.${safeExt}`;
};

export const normalizeSoundEntry = (entry) => {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  if (typeof entry !== 'object') return null;

  const path = typeof entry.path === 'string' ? entry.path : '';
  if (!path) return null;

  return {
    path,
    storage: entry.storage === 'appData' ? 'appData' : 'external',
    sourceName: typeof entry.sourceName === 'string' && entry.sourceName.trim()
      ? entry.sourceName.trim()
      : path.split(/[\\/]/).pop() || 'Fichier audio',
  };
};

export const getSoundDisplayName = (entry) => {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.split(/[\\/]/).pop() || entry;
  return entry.sourceName || entry.path?.split(/[\\/]/).pop() || 'Fichier audio';
};

export const isAppDataSoundEntry = (entry) => {
  const normalized = normalizeSoundEntry(entry);
  return Boolean(normalized && typeof normalized === 'object' && normalized.storage === 'appData');
};

export const getSoundMimeType = (entry) => {
  const normalized = normalizeSoundEntry(entry);
  const path = typeof normalized === 'string' ? normalized : normalized?.path || '';
  const ext = path.split('.').pop()?.toLocaleLowerCase('fr-FR') || '';
  return {
    mp3: 'audio/mpeg',
    mpeg: 'audio/mpeg',
    wav: 'audio/wav',
    wave: 'audio/wav',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    weba: 'audio/webm',
    webm: 'audio/webm',
  }[ext] || 'application/octet-stream';
};

export const resolveSoundFilePath = async (entry, pathApi = { appDataDir, join }) => {
  const normalized = normalizeSoundEntry(entry);
  if (!normalized) return '';
  if (typeof normalized === 'string') return normalized;
  if (normalized.storage !== 'appData') return normalized.path;

  const root = await pathApi.appDataDir();
  return pathApi.join(root, normalized.path);
};

export const readAppDataSoundBytes = async (entry, fs = { readFile }) => {
  const normalized = normalizeSoundEntry(entry);
  if (!normalized || typeof normalized === 'string' || normalized.storage !== 'appData') {
    return null;
  }
  return fs.readFile(normalized.path, { baseDir: BaseDirectory.AppData });
};

export async function copyCustomSoundToAppData(sourcePath, type, deps = {}) {
  const fs = deps.fs || { mkdir, readFile, writeFile };
  const now = deps.now || Date.now;
  const originalName = String(sourcePath || '').split(/[\\/]/).pop() || 'son.wav';
  const safeName = cleanFileName(originalName);
  const fileName = `${type}-${now()}-${safeName}`;
  const targetPath = `${SOUND_STORAGE_DIR}/${fileName}`;
  const bytes = await fs.readFile(sourcePath);

  await fs.mkdir(SOUND_STORAGE_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  await fs.writeFile(targetPath, bytes, { baseDir: BaseDirectory.AppData });

  return {
    path: targetPath,
    storage: 'appData',
    sourceName: originalName,
  };
}
