import { describe, expect, it } from 'vitest';
import { ExtensionStore } from './extensionStore';

const pluginManifest = {
  id: 'com.caltemp.tests.plugin',
  name: 'Plugin test',
  type: 'plugin',
  version: '1.0.0',
  sdkVersion: '1.1.0',
  compatibility: { caltemp: '>=6.0.0' },
  entry: 'index.js',
  permissions: [],
};

const detectedManifest = {
  id: 'com.caltemp.tests.detected',
  name: 'Detected local',
  type: 'plugin',
  version: '1.0.0',
  sdkVersion: '1.1.0',
  compatibility: { caltemp: '>=6.0.0' },
  entry: 'index.js',
  permissions: [],
};

const themeManifest = (id) => ({
  id,
  name: id,
  type: 'theme',
  version: '1.0.0',
  sdkVersion: '1.1.0',
  compatibility: { caltemp: '>=6.0.0' },
  permissions: [],
  theme: { variables: { '--caltemp-accent': '#ff0033' } },
});

function createMemoryFs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const removed = [];

  const listDirectories = (path) => {
    const prefix = `${path}/`;
    return [...new Set(
      [...files.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length).split('/')[0])
        .filter(Boolean),
    )].map((name) => ({ name, isDirectory: true }));
  };

  return {
    files,
    removed,
    async exists(path) {
      return files.has(path) || listDirectories(path).length > 0;
    },
    async mkdir() {},
    async readDir(path) {
      return listDirectories(path);
    },
    async readTextFile(path) {
      if (!files.has(path)) throw new Error(`Missing file: ${path}`);
      return files.get(path);
    },
    async writeTextFile(path, content) {
      files.set(path, content);
    },
    async remove(path) {
      removed.push(path);
      for (const key of [...files.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) files.delete(key);
      }
    },
  };
}

describe('ExtensionStore', () => {
  it('scans AppData extension folders and keeps unindexed folders disabled', async () => {
    const fs = createMemoryFs({
      'extensions/extensions.json': JSON.stringify({
        installed: [{ id: pluginManifest.id, enabled: true, installedVersion: '1.0.0' }],
      }),
      [`extensions/${pluginManifest.id}/manifest.json`]: JSON.stringify(pluginManifest),
      [`extensions/${pluginManifest.id}/index.js`]: 'export function activate() {}',
      [`extensions/${detectedManifest.id}/manifest.json`]: JSON.stringify(detectedManifest),
      [`extensions/${detectedManifest.id}/index.js`]: 'export function activate() {}',
    });
    const store = new ExtensionStore({ fs });

    const installed = await store.listInstalled();

    expect(installed.map((item) => item.manifest.id)).toEqual([
      pluginManifest.id,
      detectedManifest.id,
    ]);
    expect(installed.find((item) => item.manifest.id === pluginManifest.id).enabled).toBe(true);
    expect(installed.find((item) => item.manifest.id === detectedManifest.id).enabled).toBe(false);
  });

  it('installs bundled examples from folder-shaped manifests', async () => {
    const fs = createMemoryFs();
    const store = new ExtensionStore({ fs });

    await store.installFromLocalExample({
      source: 'bundled-example',
      manifestText: JSON.stringify(pluginManifest),
      entryCode: 'export function activate() {}',
    });

    expect(JSON.parse(fs.files.get(`extensions/${pluginManifest.id}/manifest.json`)).id).toBe(pluginManifest.id);
    expect(fs.files.get(`extensions/${pluginManifest.id}/index.js`)).toContain('activate');
    expect(JSON.parse(fs.files.get('extensions/extensions.json')).installed[0]).toMatchObject({
      id: pluginManifest.id,
      enabled: true,
      source: 'bundled-example',
    });
  });

  it('creates index entries on enable and keeps only one theme enabled', async () => {
    const firstTheme = themeManifest('com.caltemp.tests.theme-one');
    const secondTheme = themeManifest('com.caltemp.tests.theme-two');
    const fs = createMemoryFs({
      [`extensions/${firstTheme.id}/manifest.json`]: JSON.stringify(firstTheme),
      [`extensions/${secondTheme.id}/manifest.json`]: JSON.stringify(secondTheme),
      'extensions/extensions.json': JSON.stringify({
        installed: [{ id: secondTheme.id, enabled: true, installedVersion: '1.0.0' }],
      }),
    });
    const store = new ExtensionStore({ fs });

    await store.setEnabled(firstTheme.id, true);

    const index = JSON.parse(fs.files.get('extensions/extensions.json'));
    expect(index.installed.find((item) => item.id === firstTheme.id).enabled).toBe(true);
    expect(index.installed.find((item) => item.id === secondTheme.id).enabled).toBe(false);
  });
});
