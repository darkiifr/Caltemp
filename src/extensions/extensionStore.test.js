import { describe, expect, it } from 'vitest';
import { ExtensionStore, prepareExtension, prepareExtensionFromFiles } from './extensionStore';

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

  it('installs a single-file plugin and keeps state and settings on update', async () => {
    const fs = createMemoryFs();
    const store = new ExtensionStore({ fs });
    const source = (version) => `/** @caltemp
 * id: com.caltemp.tests.single
 * name: Single
 * version: ${version}
 */
export function activate() {}`;

    await store.installPrepared(prepareExtension({ code: source('1.0.0') }));
    await store.setEnabled('com.caltemp.tests.single', false);
    await store.setConfig('com.caltemp.tests.single', { greeting: 'Salut' });
    await store.installPrepared(prepareExtension({ code: source('1.1.0') }));

    const [record] = await store.listInstalled();
    expect(record.manifest).toMatchObject({ id: 'com.caltemp.tests.single', version: '1.1.0', entry: 'index.js' });
    expect(record.entryCode).toContain('activate');
    expect(record.enabled).toBe(false);
    expect(record.config).toEqual({ greeting: 'Salut' });
  });

  it('persists private extension storage next to the manifest', async () => {
    const fs = createMemoryFs({
      [`extensions/${pluginManifest.id}/manifest.json`]: JSON.stringify(pluginManifest),
    });
    const store = new ExtensionStore({ fs });

    expect(await store.readStorage(pluginManifest.id)).toEqual({});
    await store.writeStorage(pluginManifest.id, { runs: 2 });
    expect(await store.readStorage(pluginManifest.id)).toEqual({ runs: 2 });

    await store.writeStorage('com.caltemp.tests.removed', { runs: 1 });
    expect(fs.files.has('extensions/com.caltemp.tests.removed/storage.json')).toBe(false);
  });
});

describe('prepareExtensionFromFiles', () => {
  const header = '/** @caltemp\n * id: com.caltemp.tests.file\n * name: File\n * version: 1.0.0\n */\nexport function activate() {}';

  it('accepts a lone plugin file', () => {
    const prepared = prepareExtensionFromFiles([{ name: 'plugin.js', text: header }]);
    expect(prepared.manifest.id).toBe('com.caltemp.tests.file');
    expect(prepared.code).toBe(header);
  });

  it('accepts a manifest with its entry file, or a theme manifest alone', () => {
    const prepared = prepareExtensionFromFiles([
      { name: 'manifest.json', text: JSON.stringify(pluginManifest) },
      { name: 'index.js', text: 'export function activate() {}' },
    ]);
    expect(prepared.manifest.id).toBe(pluginManifest.id);

    const theme = prepareExtensionFromFiles([{ name: 'manifest.json', text: JSON.stringify(themeManifest('com.caltemp.tests.t')) }]);
    expect(theme.manifest.type).toBe('theme');
    expect(theme.code).toBe('');
  });

  it('explains what is missing', () => {
    expect(() => prepareExtensionFromFiles([{ name: 'manifest.json', text: JSON.stringify(pluginManifest) }]))
      .toThrow(/index\.js/);
    expect(() => prepareExtensionFromFiles([{ name: 'plugin.js', text: 'export function activate() {}' }]))
      .toThrow(/@caltemp/);
    expect(() => prepareExtensionFromFiles([])).toThrow(/Sélectionnez/);
  });
});
