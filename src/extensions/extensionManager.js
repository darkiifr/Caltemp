import { ExtensionEventBus } from './extensionEvents.js';
import { validateExtensionManifest } from './manifest.js';
import { createExtensionContext } from './sdk/createExtensionContext.js';

function getDefaultRootStyle() {
  if (typeof document === 'undefined') return null;
  return document.documentElement?.style || null;
}

async function defaultLoadPluginModule(extensionRecord) {
  const code = extensionRecord.entryCode || '';
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    return await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createMemoryStorage() {
  const data = new Map();
  return {
    async get(extensionId, key) {
      return data.get(`${extensionId}:${key}`);
    },
    async set(extensionId, key, value) {
      data.set(`${extensionId}:${key}`, value);
    },
    async remove(extensionId, key) {
      data.delete(`${extensionId}:${key}`);
    },
  };
}

export class ExtensionManager {
  constructor({
    store,
    host = {},
    rootStyle = getDefaultRootStyle(),
    loadPluginModule = defaultLoadPluginModule,
    storage = createMemoryStorage(),
    logger = console,
  } = {}) {
    this.store = store;
    this.host = host;
    this.rootStyle = rootStyle;
    this.loadPluginModule = loadPluginModule;
    this.storage = storage;
    this.logger = logger;
    this.eventBus = new ExtensionEventBus();
    this.installed = [];
    this.activePlugins = new Map();
    this.appliedThemeVariables = new Set();
    this.errors = [];
  }

  async initialize() {
    this.errors = [];
    this.installed = await this.loadInstalled();

    for (const extensionRecord of this.installed) {
      if (!extensionRecord.enabled) continue;

      if (extensionRecord.manifest.type === 'theme') {
        this.applyTheme(extensionRecord.manifest);
      }

      if (extensionRecord.manifest.type === 'plugin') {
        await this.activatePlugin(extensionRecord);
      }
    }

    return this.installed;
  }

  async loadInstalled() {
    if (!this.store?.listInstalled) return [];
    const records = await this.store.listInstalled();

    return records.map((record) => ({
      ...record,
      manifest: validateExtensionManifest(record.manifest),
    }));
  }

  async activatePlugin(extensionRecord) {
    const { manifest } = extensionRecord;
    try {
      const module = await this.loadPluginModule(extensionRecord);
      if (typeof module.activate !== 'function') {
        throw new Error(`L'extension ${manifest.id} ne définit pas activate(ctx).`);
      }

      const context = createExtensionContext({
        manifest,
        eventBus: this.eventBus,
        host: this.host,
        storage: this.storage,
        logger: this.logger,
      });

      const cleanup = await module.activate(context);
      this.activePlugins.set(manifest.id, {
        manifest,
        deactivate: typeof module.deactivate === 'function' ? module.deactivate : cleanup,
        context,
      });
      this.eventBus.emit('extension:enabled', { id: manifest.id });
    } catch (error) {
      this.errors.push({ extensionId: manifest.id, message: error.message, error });
      this.logger.warn?.(`Extension ${manifest.id} désactivée:`, error);
    }
  }

  async deactivatePlugin(extensionId) {
    const active = this.activePlugins.get(extensionId);
    if (!active) return;

    if (typeof active.deactivate === 'function') {
      await active.deactivate(active.context);
    }

    this.activePlugins.delete(extensionId);
    this.eventBus.emit('extension:disabled', { id: extensionId });
  }

  applyTheme(manifest) {
    if (!this.rootStyle) return;
    this.clearTheme();
    for (const [name, value] of Object.entries(manifest.theme.variables)) {
      this.rootStyle.setProperty(name, value);
      this.appliedThemeVariables.add(name);
    }
    this.eventBus.emit('theme:changed', { id: manifest.id, variables: manifest.theme.variables });
  }

  clearTheme() {
    if (!this.rootStyle) return;
    for (const variable of this.appliedThemeVariables) {
      this.rootStyle.removeProperty(variable);
    }
    this.appliedThemeVariables.clear();
  }

  emit(eventName, payload) {
    this.eventBus.emit(eventName, payload);
  }

  getInstalled() {
    return this.installed;
  }

  getErrors() {
    return this.errors;
  }
}
