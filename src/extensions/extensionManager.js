import { CALENDAR_EVENTS, CALTEMP_SDK_VERSION } from './constants.js';
import { ExtensionEventBus } from './extensionEvents.js';
import { createExtensionStorage } from './extensionStorage.js';
import { resolveExtensionConfig, validateExtensionManifest } from './manifest.js';
import { createPluginApi, pickReadableSettings } from './sandbox/hostApi.js';
import { PluginConnection } from './sandbox/pluginConnection.js';
import { createInProcessTransport, createWorkerTransport } from './sandbox/transports.js';

function getDefaultRootStyle() {
  if (typeof document === 'undefined') return null;
  return document.documentElement?.style || null;
}

function createDefaultTransport() {
  if (typeof Worker === 'undefined') {
    throw new Error('Le bac à sable des plugins (Web Worker) est indisponible.');
  }
  return createWorkerTransport();
}

// Plugins without `calendar:read` learn that something changed, not what;
// settings are filtered like `ctx.settings.read()`.
function payloadFor(eventName, payload, api) {
  if (eventName === 'settings:changed') {
    return api.hasPermission('settings:read') ? { settings: pickReadableSettings(payload?.settings) } : {};
  }
  if (!CALENDAR_EVENTS.includes(eventName) || api.hasPermission('calendar:read')) return payload;
  return { eventId: payload?.event?.id ?? payload?.eventId ?? null };
}

/**
 * Loads installed extensions, applies the active theme and runs each enabled
 * plugin in its own sandbox. Every lifecycle operation (enable, disable,
 * install, update, remove, reload, config change) applies immediately, with
 * no app restart.
 */
export class ExtensionManager {
  constructor({
    store,
    host = {},
    rootStyle = getDefaultRootStyle(),
    // Tests (and tooling) can provide the plugin module directly; it then runs
    // in-process through the same protocol.
    loadPluginModule = null,
    createTransport = null,
    storage = null,
    logger = console,
    onChange = null,
  } = {}) {
    this.store = store;
    this.host = host;
    this.rootStyle = rootStyle;
    this.logger = logger;
    this.onChange = onChange;
    this.createTransport = createTransport || (loadPluginModule
      ? (record) => createInProcessTransport({ importModule: () => loadPluginModule(record) })
      : createDefaultTransport);
    this.storage = storage || createExtensionStorage(
      store?.readStorage && store?.writeStorage
        ? { read: (id) => store.readStorage(id), write: (id, data) => store.writeStorage(id, data) }
        : null,
    );
    this.eventBus = new ExtensionEventBus();
    this.installed = [];
    this.connections = new Map();
    this.appliedThemeVariables = new Map();
    this.errors = [];
  }

  async initialize() {
    await this.stopAll();
    this.errors = [];
    this.clearTheme();
    this.installed = await this.loadInstalled();

    for (const record of this.installed) {
      if (record.enabled && record.manifest.type === 'theme') this.applyTheme(record.manifest);
    }
    await Promise.all(this.installed
      .filter((record) => record.enabled && record.manifest.type === 'plugin')
      .map((record) => this.activatePlugin(record)));

    this.changed();
    return this.installed;
  }

  async loadInstalled() {
    if (!this.store?.listInstalled) return [];
    const records = await this.store.listInstalled();
    const valid = [];
    for (const record of records) {
      try {
        valid.push({ ...record, manifest: validateExtensionManifest(record.manifest) });
      } catch (error) {
        this.recordError(record?.manifest?.id || record?.id || 'extension', error);
      }
    }
    return valid;
  }

  getRecord(extensionId) {
    return this.installed.find((record) => record.manifest.id === extensionId) || null;
  }

  recordError(extensionId, error) {
    this.errors = [
      ...this.errors.filter((item) => item.extensionId !== extensionId),
      { extensionId, message: error?.message || String(error), error },
    ];
  }

  clearError(extensionId) {
    this.errors = this.errors.filter((item) => item.extensionId !== extensionId);
  }

  async activatePlugin(record) {
    const { manifest } = record;
    if (this.connections.has(manifest.id)) await this.deactivatePlugin(manifest.id, { silent: true });
    this.clearError(manifest.id);

    let connection = null;
    try {
      const config = resolveExtensionConfig(manifest, record.config);
      const api = createPluginApi({
        manifest,
        host: this.host,
        storage: this.storage.forExtension(manifest.id),
        config: { set: (values) => this.saveConfig(manifest.id, { ...this.getConfig(manifest.id), ...values }) },
        emitCustomEvent: (eventName, payload) => this.emit(eventName, payload),
      });
      connection = new PluginConnection({
        manifest,
        transport: this.createTransport(record),
        api,
        logger: this.logger,
        onCrash: (error) => {
          this.recordError(manifest.id, error);
          this.changed();
        },
      });
      this.connections.set(manifest.id, connection);
      await connection.start({ code: record.entryCode || '', config, sdkVersion: CALTEMP_SDK_VERSION });
      this.eventBus.emit('extension:enabled', { id: manifest.id });
      this.dispatch('extension:enabled', { id: manifest.id });
      return true;
    } catch (error) {
      if (this.connections.get(manifest.id) === connection) this.connections.delete(manifest.id);
      connection?.terminate();
      this.recordError(manifest.id, error);
      this.logger.warn?.(`Extension ${manifest.id} désactivée:`, error);
      return false;
    }
  }

  async deactivatePlugin(extensionId, { silent = false } = {}) {
    const connection = this.connections.get(extensionId);
    if (!connection) return;
    this.connections.delete(extensionId);
    await connection.stop();
    if (!silent) {
      this.eventBus.emit('extension:disabled', { id: extensionId });
      this.dispatch('extension:disabled', { id: extensionId });
    }
  }

  async stopAll() {
    await Promise.all([...this.connections.keys()].map((id) => this.deactivatePlugin(id, { silent: true })));
  }

  async dispose() {
    await this.stopAll();
    await this.storage.flushAll?.();
    this.clearTheme();
    this.eventBus.clear();
  }

  // Re-reads one extension from the store and makes the runtime match it.
  async sync(extensionId) {
    await this.deactivatePlugin(extensionId, { silent: true });
    this.clearTheme(extensionId);
    this.clearError(extensionId);
    this.installed = await this.loadInstalled();

    // Enabling a theme disables the others in the store: drop their variables.
    for (const themeId of [...this.appliedThemeVariables.keys()]) {
      if (!this.getRecord(themeId)?.enabled) this.clearTheme(themeId);
    }

    const record = this.getRecord(extensionId);
    if (record?.enabled) {
      if (record.manifest.type === 'theme') this.applyTheme(record.manifest);
      else await this.activatePlugin(record);
    }
    this.changed();
    return record;
  }

  async setEnabled(extensionId, enabled) {
    await this.store.setEnabled(extensionId, enabled);
    return this.sync(extensionId);
  }

  reload(extensionId) {
    return this.sync(extensionId);
  }

  async install(prepared, { source } = {}) {
    const previous = this.getRecord(prepared.manifest.id);
    const manifest = await this.store.installPrepared(prepared, { source });
    await this.sync(manifest.id);
    const eventName = previous ? 'extension:updated' : 'extension:installed';
    this.eventBus.emit(eventName, { id: manifest.id, version: manifest.version });
    this.dispatch(eventName, { id: manifest.id, version: manifest.version });
    return manifest;
  }

  async remove(extensionId) {
    await this.deactivatePlugin(extensionId, { silent: true });
    this.clearTheme(extensionId);
    this.clearError(extensionId);
    this.storage.forget?.(extensionId);
    await this.store.removeExtension(extensionId);
    this.installed = this.installed.filter((record) => record.manifest.id !== extensionId);
    this.eventBus.emit('extension:removed', { id: extensionId });
    this.dispatch('extension:removed', { id: extensionId });
    this.changed();
  }

  getConfig(extensionId) {
    const record = this.getRecord(extensionId);
    return record ? resolveExtensionConfig(record.manifest, record.config) : {};
  }

  async saveConfig(extensionId, values) {
    const record = this.getRecord(extensionId);
    if (!record) throw new Error(`Extension introuvable: ${extensionId}`);
    const config = resolveExtensionConfig(record.manifest, values);
    await this.store.setConfig?.(extensionId, config);
    this.installed = this.installed.map((item) => (
      item.manifest.id === extensionId ? { ...item, config } : item
    ));
    this.connections.get(extensionId)?.pushConfig(config);
    this.changed();
    return config;
  }

  applyTheme(manifest) {
    if (!this.rootStyle) return;
    this.clearTheme();
    const variables = new Set();
    for (const [name, value] of Object.entries(manifest.theme.variables)) {
      this.rootStyle.setProperty(name, value);
      variables.add(name);
    }
    this.appliedThemeVariables.set(manifest.id, variables);
    this.emit('theme:changed', { id: manifest.id, variables: manifest.theme.variables });
  }

  clearTheme(extensionId = null) {
    if (!this.rootStyle) return;
    const entries = extensionId
      ? [[extensionId, this.appliedThemeVariables.get(extensionId) || new Set()]]
      : Array.from(this.appliedThemeVariables.entries());

    for (const [, variables] of entries) {
      for (const variable of variables) {
        this.rootStyle.removeProperty(variable);
      }
    }

    if (extensionId) this.appliedThemeVariables.delete(extensionId);
    else this.appliedThemeVariables.clear();
  }

  dispatch(eventName, payload) {
    for (const connection of this.connections.values()) {
      connection.dispatchEvent(eventName, payloadFor(eventName, payload, connection.api));
    }
  }

  // App and plugin events: host listeners (`on`) and every subscribed plugin.
  emit(eventName, payload) {
    this.eventBus.emit(eventName, payload);
    this.dispatch(eventName, payload);
  }

  on(eventName, handler) {
    return this.eventBus.on(eventName, handler);
  }

  getStatus(extensionId) {
    const record = this.getRecord(extensionId);
    if (!record) return 'missing';
    if (this.errors.some((item) => item.extensionId === extensionId)) return 'error';
    if (!record.enabled) return 'disabled';
    if (record.manifest.type === 'theme') return 'active';
    return this.connections.has(extensionId) ? 'active' : 'error';
  }

  // Snapshot for the UI: no plugin code, plus status, error and config.
  getInstalled() {
    return this.installed.map((record) => ({
      ...record,
      entryCode: undefined,
      config: resolveExtensionConfig(record.manifest, record.config),
      status: this.getStatus(record.manifest.id),
      error: this.errors.find((item) => item.extensionId === record.manifest.id)?.message || '',
    }));
  }

  getErrors() {
    return this.errors;
  }

  changed() {
    this.onChange?.(this);
  }
}
