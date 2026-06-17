import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { validateExtensionManifest } from './manifest.js';

const EXTENSIONS_DIR = 'extensions';
const EXTENSIONS_INDEX = `${EXTENSIONS_DIR}/extensions.json`;

async function ensureExtensionsDir() {
  const dirExists = await exists(EXTENSIONS_DIR, { baseDir: BaseDirectory.AppData });
  if (!dirExists) {
    await mkdir(EXTENSIONS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  }
}

async function readIndex() {
  await ensureExtensionsDir();
  const hasIndex = await exists(EXTENSIONS_INDEX, { baseDir: BaseDirectory.AppData });
  if (!hasIndex) return { installed: [] };

  try {
    return JSON.parse(await readTextFile(EXTENSIONS_INDEX, { baseDir: BaseDirectory.AppData }));
  } catch (error) {
    console.error('Extensions index invalide:', error);
    return { installed: [] };
  }
}

async function writeIndex(index) {
  await ensureExtensionsDir();
  await writeTextFile(EXTENSIONS_INDEX, JSON.stringify(index, null, 2), {
    baseDir: BaseDirectory.AppData,
  });
}

async function readTextUrl(url) {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}).`);
  return response.text();
}

async function sha256(text) {
  if (!globalThis.crypto?.subtle) return '';
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function validateChecksum(text, expectedSha256) {
  if (!expectedSha256 || expectedSha256.length !== 64) return;
  const actual = await sha256(text);
  if (actual && actual !== expectedSha256.toLowerCase()) {
    throw new Error('La somme de contrôle de l’extension ne correspond pas.');
  }
}

export class ExtensionStore {
  async listInstalled() {
    const index = await readIndex();
    const records = [];

    for (const item of index.installed || []) {
      try {
        const basePath = `${EXTENSIONS_DIR}/${item.id}`;
        const manifest = JSON.parse(
          await readTextFile(`${basePath}/manifest.json`, { baseDir: BaseDirectory.AppData }),
        );
        let entryCode = '';
        if (manifest.entry) {
          entryCode = await readTextFile(`${basePath}/${manifest.entry}`, {
            baseDir: BaseDirectory.AppData,
          });
        }
        records.push({ ...item, manifest, entryCode });
      } catch (error) {
        console.error(`Extension ignorée (${item.id}):`, error);
      }
    }

    return records;
  }

  async installFromRegistryEntry(entry) {
    const manifestText = await readTextUrl(entry.manifestUrl);
    const manifest = validateExtensionManifest(JSON.parse(manifestText));
    const basePath = `${EXTENSIONS_DIR}/${manifest.id}`;

    await mkdir(basePath, { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile(`${basePath}/manifest.json`, JSON.stringify(manifest, null, 2), {
      baseDir: BaseDirectory.AppData,
    });

    if (manifest.type === 'plugin') {
      const code = await readTextUrl(entry.assetUrl);
      await validateChecksum(code, entry.sha256);
      await writeTextFile(`${basePath}/${manifest.entry}`, code, {
        baseDir: BaseDirectory.AppData,
      });
    }

    const index = await readIndex();
    const installed = (index.installed || []).filter((item) => item.id !== manifest.id);
    installed.push({
      id: manifest.id,
      enabled: true,
      source: entry.repository,
      installedVersion: manifest.version,
      installedAt: new Date().toISOString(),
    });
    await writeIndex({ installed });
    return manifest;
  }

  async removeExtension(extensionId) {
    const index = await readIndex();
    const installed = (index.installed || []).filter((item) => item.id !== extensionId);
    await writeIndex({ installed });

    const path = `${EXTENSIONS_DIR}/${extensionId}`;
    if (await exists(path, { baseDir: BaseDirectory.AppData })) {
      await remove(path, { baseDir: BaseDirectory.AppData, recursive: true });
    }
  }

  async setEnabled(extensionId, enabled) {
    const index = await readIndex();
    const installed = (index.installed || []).map((item) =>
      item.id === extensionId ? { ...item, enabled } : item,
    );
    await writeIndex({ installed });
  }
}
