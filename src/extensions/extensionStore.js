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
import { manifestFromPluginSource, validateExtensionManifest } from './manifest.js';

const EXTENSIONS_DIR = 'extensions';
const EXTENSIONS_INDEX = `${EXTENSIONS_DIR}/extensions.json`;
const STORAGE_FILE = 'storage.json';
const MAX_PLUGIN_SOURCE_BYTES = 2 * 1024 * 1024;

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

function checkSourceSize(code) {
  if (code.length > MAX_PLUGIN_SOURCE_BYTES) {
    throw new Error('Le fichier du plugin dépasse 2 Mo.');
  }
}

/**
 * Turns what the user or a registry provides into `{ manifest, code }`
 * without writing anything, so the UI can show name and permissions first.
 *
 * - a theme: `manifest.json` alone;
 * - a plugin: `manifest.json` + its entry file, or a single `.js` file with a
 *   `@caltemp` header.
 */
export function prepareExtension({ manifestText = '', code = '' } = {}) {
  if (code) checkSourceSize(code);

  if (manifestText) {
    let raw;
    try {
      raw = JSON.parse(manifestText);
    } catch {
      throw new Error('manifest.json n’est pas un JSON valide.');
    }
    const manifest = validateExtensionManifest(raw);
    if (manifest.type === 'plugin' && !code) {
      throw new Error(`Le plugin ${manifest.id} nécessite aussi son fichier ${manifest.entry}.`);
    }
    return { manifest, code: manifest.type === 'plugin' ? code : '' };
  }

  if (code) return { manifest: manifestFromPluginSource(code), code };
  throw new Error('Aucun fichier d’extension fourni.');
}

/**
 * Same as `prepareExtension` for files picked or dropped by the user:
 * `[{ name, text }]`. Accepts a lone `.js`, a lone theme `manifest.json`, or
 * a manifest plus its entry file.
 */
export function prepareExtensionFromFiles(files = []) {
  const jsonFiles = files.filter((file) => /\.json$/i.test(file.name));
  const jsFiles = files.filter((file) => /\.m?js$/i.test(file.name));
  if (jsonFiles.length > 1) throw new Error('Sélectionnez un seul manifest.json.');

  if (jsonFiles.length === 1) {
    const manifestText = jsonFiles[0].text;
    let entry = 'index.js';
    try {
      entry = JSON.parse(manifestText)?.entry || entry;
    } catch {
      // Reported by prepareExtension.
    }
    const entryFile = jsFiles.find((file) => file.name === entry) || (jsFiles.length === 1 ? jsFiles[0] : null);
    return prepareExtension({ manifestText, code: entryFile?.text || '' });
  }

  if (jsFiles.length === 1) return prepareExtension({ code: jsFiles[0].text });
  if (jsFiles.length > 1) throw new Error('Sélectionnez un seul fichier .js (ou un manifest.json avec son fichier).');
  throw new Error('Sélectionnez un fichier .js ou manifest.json.');
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
        if (manifest.type === 'plugin') {
          entryCode = await this.fs.readTextFile(`${basePath}/${manifest.entry}`, appDataOptions());
        }
        records.push({ ...item, config: item.config || {}, manifest, entryCode });
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

  /**
   * Writes a prepared extension (see `prepareExtension`). Reinstalling keeps
   * the enabled state and the user's settings for that extension.
   */
  async installPrepared({ manifest, code = '' }, { source = 'local-file' } = {}) {
    const basePath = `${EXTENSIONS_DIR}/${manifest.id}`;

    await this.fs.mkdir(basePath, appDataOptions({ recursive: true }));
    await this.fs.writeTextFile(`${basePath}/manifest.json`, JSON.stringify(manifest, null, 2), appDataOptions());
    if (manifest.type === 'plugin') {
      await this.fs.writeTextFile(`${basePath}/${manifest.entry}`, code, appDataOptions());
    }

    const index = await readIndex(this.fs);
    const previous = (index.installed || []).find((item) => item.id === manifest.id);
    const installed = (index.installed || []).filter((item) => item.id !== manifest.id);
    installed.push({
      id: manifest.id,
      enabled: previous ? previous.enabled !== false : true,
      source,
      installedVersion: manifest.version,
      installedAt: previous?.installedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: previous?.config || {},
    });
    await writeIndex(this.fs, { installed });
    if (manifest.type === 'theme' && installed.at(-1).enabled) {
      await this.setEnabled(manifest.id, true);
    }
    return manifest;
  }

  /**
   * Downloads a registry entry. `manifestUrl` is optional: without it the
   * asset is a single-file plugin carrying its own `@caltemp` header.
   */
  async prepareFromRegistryEntry(entry) {
    const manifestText = entry.manifestUrl ? await readTextUrl(entry.manifestUrl) : '';
    let code = '';
    let isTheme = false;
    if (manifestText) {
      try {
        isTheme = validateExtensionManifest(JSON.parse(manifestText)).type === 'theme';
      } catch {
        // prepareExtension reports the error.
      }
    }
    if (!isTheme && entry.assetUrl) {
      code = await readTextUrl(entry.assetUrl);
      await validateChecksum(code, entry.sha256);
    }
    const prepared = prepareExtension({ manifestText, code });
    if (entry.id && prepared.manifest.id !== entry.id) {
      throw new Error(`Le registry annonce ${entry.id} mais le paquet contient ${prepared.manifest.id}.`);
    }
    return prepared;
  }

  async installFromRegistryEntry(entry) {
    return this.installPrepared(await this.prepareFromRegistryEntry(entry), { source: entry.repository });
  }

  async installFromLocalExample(example) {
    const prepared = prepareExtension({ manifestText: example.manifestText, code: example.entryCode || '' });
    return this.installPrepared(prepared, { source: example.source || 'bundled-example' });
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

  async updateIndexEntry(extensionId, patch) {
    const manifest = await this.readManifest(extensionId);
    const index = await readIndex(this.fs);
    const installed = [...(index.installed || [])];
    const existingIndex = installed.findIndex((item) => item.id === extensionId);
    const existing = existingIndex >= 0 ? installed[existingIndex] : null;

    const nextEntry = {
      enabled: false,
      ...(existing || {}),
      id: extensionId,
      source: existing ? existing.source : 'local-detected',
      installedVersion: manifest.version,
      installedAt: existing ? existing.installedAt : new Date().toISOString(),
      ...patch,
    };

    if (existingIndex >= 0) installed[existingIndex] = nextEntry;
    else installed.push(nextEntry);
    return { manifest, installed };
  }

  async setEnabled(extensionId, enabled) {
    const { manifest, installed } = await this.updateIndexEntry(extensionId, { enabled });

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

  async setConfig(extensionId, config) {
    const { installed } = await this.updateIndexEntry(extensionId, { config });
    await writeIndex(this.fs, { installed });
  }

  async readStorage(extensionId) {
    const path = `${EXTENSIONS_DIR}/${extensionId}/${STORAGE_FILE}`;
    if (!(await this.fs.exists(path, appDataOptions()))) return {};
    return JSON.parse(await this.fs.readTextFile(path, appDataOptions()));
  }

  async writeStorage(extensionId, data) {
    const basePath = `${EXTENSIONS_DIR}/${extensionId}`;
    // The extension may have been removed while a write was pending.
    if (!(await this.fs.exists(`${basePath}/manifest.json`, appDataOptions()))) return;
    await this.fs.writeTextFile(`${basePath}/${STORAGE_FILE}`, JSON.stringify(data), appDataOptions());
  }
}
