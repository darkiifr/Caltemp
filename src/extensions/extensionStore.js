import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { validateExtensionManifest } from './manifest.js';

const EXTENSIONS_DIR = 'extensions';
const EXTENSIONS_INDEX = `${EXTENSIONS_DIR}/extensions.json`;

const defaultFs = {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
};

function appDataOptions(options = {}) {
  return { baseDir: BaseDirectory.AppData, ...options };
}

async function ensureExtensionsDir(fs) {
  const dirExists = await fs.exists(EXTENSIONS_DIR, appDataOptions());
  if (!dirExists) {
    await fs.mkdir(EXTENSIONS_DIR, appDataOptions({ recursive: true }));
  }
}

async function readIndex(fs) {
  await ensureExtensionsDir(fs);
  const hasIndex = await fs.exists(EXTENSIONS_INDEX, appDataOptions());
  if (!hasIndex) return { installed: [] };

  try {
    return JSON.parse(await fs.readTextFile(EXTENSIONS_INDEX, appDataOptions()));
  } catch (error) {
    console.error('Extensions index invalide:', error);
    return { installed: [] };
  }
}

async function writeIndex(fs, index) {
  await ensureExtensionsDir(fs);
  await fs.writeTextFile(EXTENSIONS_INDEX, JSON.stringify(index, null, 2), appDataOptions());
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
  constructor({ fs = defaultFs } = {}) {
    this.fs = fs;
  }

  async listInstalled() {
    const index = await readIndex(this.fs);
    const indexedById = new Map((index.installed || []).map((item) => [item.id, item]));
    const extensionIds = [];
    const seen = new Set();

    for (const item of index.installed || []) {
      if (item?.id && !seen.has(item.id)) {
        extensionIds.push(item.id);
        seen.add(item.id);
      }
    }

    for (const item of await this.scanExtensionDirectories()) {
      if (item.id && !seen.has(item.id)) {
        extensionIds.push(item.id);
        seen.add(item.id);
      }
    }

    const records = [];

    for (const extensionId of extensionIds) {
      try {
        const item = indexedById.get(extensionId) || {
          id: extensionId,
          enabled: false,
          source: 'local-detected',
        };
        const basePath = `${EXTENSIONS_DIR}/${extensionId}`;
        const manifest = await this.readManifest(extensionId);
        let entryCode = '';
        if (manifest.entry) {
          entryCode = await this.fs.readTextFile(`${basePath}/${manifest.entry}`, appDataOptions());
        }
        records.push({ ...item, manifest, entryCode });
      } catch (error) {
        console.error(`Extension ignorée (${extensionId}):`, error);
      }
    }

    return records;
  }

  async scanExtensionDirectories() {
    await ensureExtensionsDir(this.fs);
    let entries = [];
    try {
      entries = await this.fs.readDir(EXTENSIONS_DIR, appDataOptions());
    } catch {
      return [];
    }

    const directories = entries.filter((entry) => entry.isDirectory !== false && entry.name);
    const found = [];

    for (const entry of directories) {
      const manifestPath = `${EXTENSIONS_DIR}/${entry.name}/manifest.json`;
      if (await this.fs.exists(manifestPath, appDataOptions())) {
        found.push({ id: entry.name });
      }
    }

    return found;
  }

  async readManifest(extensionId) {
    const manifest = JSON.parse(
      await this.fs.readTextFile(`${EXTENSIONS_DIR}/${extensionId}/manifest.json`, appDataOptions()),
    );
    return validateExtensionManifest(manifest);
  }

  async installFromRegistryEntry(entry) {
    const manifestText = await readTextUrl(entry.manifestUrl);
    const manifest = validateExtensionManifest(JSON.parse(manifestText));
    const basePath = `${EXTENSIONS_DIR}/${manifest.id}`;

    await this.fs.mkdir(basePath, appDataOptions({ recursive: true }));
    await this.fs.writeTextFile(`${basePath}/manifest.json`, JSON.stringify(manifest, null, 2), appDataOptions());

    if (manifest.type === 'plugin') {
      const code = await readTextUrl(entry.assetUrl);
      await validateChecksum(code, entry.sha256);
      await this.fs.writeTextFile(`${basePath}/${manifest.entry}`, code, appDataOptions());
    }

    const index = await readIndex(this.fs);
    const installed = (index.installed || []).filter((item) => item.id !== manifest.id);
    installed.push({
      id: manifest.id,
      enabled: true,
      source: entry.repository,
      installedVersion: manifest.version,
      installedAt: new Date().toISOString(),
    });
    await writeIndex(this.fs, { installed });
    if (manifest.type === 'theme') {
      await this.setEnabled(manifest.id, true);
    }
    return manifest;
  }

  async installFromLocalExample(example) {
    const manifest = validateExtensionManifest(JSON.parse(example.manifestText));
    const basePath = `${EXTENSIONS_DIR}/${manifest.id}`;

    await this.fs.mkdir(basePath, appDataOptions({ recursive: true }));
    await this.fs.writeTextFile(`${basePath}/manifest.json`, JSON.stringify(manifest, null, 2), appDataOptions());

    if (manifest.type === 'plugin') {
      if (!example.entryCode) {
        throw new Error(`L'exemple ${manifest.id} ne contient pas le bundle ${manifest.entry}.`);
      }
      await this.fs.writeTextFile(`${basePath}/${manifest.entry}`, example.entryCode, appDataOptions());
    }

    const index = await readIndex(this.fs);
    const installed = (index.installed || []).filter((item) => item.id !== manifest.id);
    installed.push({
      id: manifest.id,
      enabled: true,
      source: example.source || 'bundled-example',
      installedVersion: manifest.version,
      installedAt: new Date().toISOString(),
    });
    await writeIndex(this.fs, { installed });
    if (manifest.type === 'theme') {
      await this.setEnabled(manifest.id, true);
    }
    return manifest;
  }

  async removeExtension(extensionId) {
    const index = await readIndex(this.fs);
    const installed = (index.installed || []).filter((item) => item.id !== extensionId);
    await writeIndex(this.fs, { installed });

    const path = `${EXTENSIONS_DIR}/${extensionId}`;
    if (await this.fs.exists(path, appDataOptions())) {
      await this.fs.remove(path, appDataOptions({ recursive: true }));
    }
  }

  async setEnabled(extensionId, enabled) {
    const manifest = await this.readManifest(extensionId);
    const index = await readIndex(this.fs);
    const installed = [...(index.installed || [])];
    const existingIndex = installed.findIndex((item) => item.id === extensionId);

    const nextEntry = {
      ...(existingIndex >= 0 ? installed[existingIndex] : {}),
      id: extensionId,
      enabled,
      source: existingIndex >= 0 ? installed[existingIndex].source : 'local-detected',
      installedVersion: manifest.version,
      installedAt: existingIndex >= 0 ? installed[existingIndex].installedAt : new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      installed[existingIndex] = nextEntry;
    } else {
      installed.push(nextEntry);
    }

    if (enabled && manifest.type === 'theme') {
      const themeIds = new Set(
        (await this.listInstalled())
          .filter((record) => record.manifest.type === 'theme')
          .map((record) => record.manifest.id),
      );
      for (const item of installed) {
        if (item.id !== extensionId && themeIds.has(item.id)) {
          item.enabled = false;
        }
      }
    }

    await writeIndex(this.fs, { installed });
  }
}
