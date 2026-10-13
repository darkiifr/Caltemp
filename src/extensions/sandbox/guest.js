import { CALLBACK_KEY, deserializeError, mapData, serializeError } from './protocol.js';

/**
 * Plugin-side runtime. It runs next to the plugin code (inside the sandbox
 * worker) and turns the message protocol into the `ctx` object handed to
 * `activate(ctx)`. It holds no privileges: every capability is a request the
 * host checks against the manifest.
 *
 * @param {object} options
 * @param {(message: object) => void} options.post sends a message to the host
 * @param {(code: string) => Promise<object>} options.importModule loads the plugin
 * @returns {(message: object) => void} handler for messages from the host
 */
export function startGuest({ post, importModule }) {
  let seq = 0;
  const pending = new Map();
  const callbacks = new Map();
  let nextCallbackId = 1;
  const eventHandlers = new Map();
  const configListeners = new Set();
  let config = {};
  let pluginModule = null;
  let ctx = null;
  let activateCleanup = null;

  const registerCallback = (fn) => {
    const id = nextCallbackId;
    nextCallbackId += 1;
    callbacks.set(id, fn);
    return id;
  };

  // Encodes call arguments; the ids of the callbacks created are returned so
  // their owner (a panel, a command) can release them later.
  const encode = (args) => {
    const created = [];
    const encoded = mapData(args, (value) => {
      if (typeof value !== 'function') return undefined;
      const id = registerCallback(value);
      created.push(id);
      return { [CALLBACK_KEY]: id };
    });
    return { encoded, created };
  };

  const callWithCallbacks = (method, ...args) => {
    const { encoded, created } = encode(args);
    seq += 1;
    const id = seq;
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    post({ kind: 'call', seq: id, method, args: encoded });
    return { promise, created };
  };

  const call = (method, ...args) => callWithCallbacks(method, ...args).promise;
  const release = (ids) => ids.forEach((id) => callbacks.delete(id));

  const on = (eventName, handler) => {
    if (typeof handler !== 'function') {
      throw new Error('Le handler d’événement doit être une fonction.');
    }
    let handlers = eventHandlers.get(eventName);
    if (!handlers) {
      handlers = new Set();
      eventHandlers.set(eventName, handlers);
      call('events.subscribe', eventName).catch((error) => {
        eventHandlers.delete(eventName);
        log('error', [`Abonnement à ${eventName} refusé:`, error.message]);
      });
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0 && eventHandlers.get(eventName) === handlers) {
        eventHandlers.delete(eventName);
        call('events.unsubscribe', eventName).catch(() => {});
      }
    };
  };

  const log = (level, args) => {
    post({ kind: 'log', level, args: mapData(args, (value) => (value instanceof Error ? value.message : undefined)) });
  };

  const registerCommand = (command) => {
    const { promise, created } = callWithCallbacks('commands.register', command);
    promise.catch((error) => log('error', ['Commande refusée:', error.message]));
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      release(created);
      call('commands.unregister', command?.id).catch(() => {});
    };
  };

  const showPanel = async (panel) => {
    let { promise, created } = callWithCallbacks('ui.showPanel', panel);
    const panelId = await promise;
    return {
      id: panelId,
      update: async (nextPanel) => {
        const previous = created;
        const next = callWithCallbacks('ui.updatePanel', panelId, nextPanel);
        created = next.created;
        await next.promise;
        release(previous);
      },
      close: async () => {
        release(created);
        created = [];
        await call('ui.closePanel', panelId);
      },
    };
  };

  const buildContext = (manifest, sdkVersion) => {
    const calendar = {
      list: (range) => call('calendar.list', range),
      occurrences: (range) => call('calendar.occurrences', range),
      get: (eventId) => call('calendar.get', eventId),
      create: (event) => call('calendar.create', event),
      update: (event) => call('calendar.update', event),
      delete: (eventId) => call('calendar.delete', eventId),
    };
    const storage = {
      get: (key) => call('storage.get', key),
      set: (key, value) => call('storage.set', key, value),
      remove: (key) => call('storage.remove', key),
      keys: () => call('storage.keys'),
      clear: () => call('storage.clear'),
    };
    const notify = (title, body = '', type = 'info') => call('notifications.send', title, body, type);
    const logger = Object.freeze({
      debug: (...args) => log('debug', args),
      info: (...args) => log('info', args),
      warn: (...args) => log('warn', args),
      error: (...args) => log('error', args),
    });

    return Object.freeze({
      sdkVersion,
      manifest,
      on,
      emit: (eventName, payload) => call('events.emit', eventName, payload),
      events: Object.freeze({ on, emit: (eventName, payload) => call('events.emit', eventName, payload) }),
      calendar: Object.freeze({
        ...calendar,
        // SDK 1.x names.
        listEvents: calendar.list,
        createEvent: calendar.create,
        updateEvent: calendar.update,
        deleteEvent: calendar.delete,
      }),
      settings: Object.freeze({ read: () => call('settings.read') }),
      notify,
      notifications: Object.freeze({ send: notify }),
      commands: Object.freeze({ register: registerCommand }),
      ui: Object.freeze({
        registerAction: registerCommand,
        toast: (message, type = 'info') => call('ui.toast', message, type),
        prompt: (options) => call('ui.prompt', options),
        openGallery: (gallery) => call('ui.openGallery', gallery),
        showPanel,
      }),
      config: Object.freeze({
        get: (key) => (key === undefined ? { ...config } : config[key]),
        set: (values) => call('config.set', values),
        onChange: (listener) => {
          configListeners.add(listener);
          return () => configListeners.delete(listener);
        },
      }),
      storage: Object.freeze(storage),
      http: Object.freeze({
        fetch: async (url, init) => {
          const response = await call('http.fetch', url, init);
          return { ...response, text: async () => response.body, json: async () => JSON.parse(response.body) };
        },
      }),
      logger,
    });
  };

  const load = async ({ code, manifest, config: initialConfig, sdkVersion }) => {
    try {
      config = initialConfig || {};
      pluginModule = await importModule(code);
      const plugin = typeof pluginModule.default === 'object' && pluginModule.default
        ? pluginModule.default
        : pluginModule;
      const activate = plugin.activate || (typeof pluginModule.default === 'function' ? pluginModule.default : null);
      if (typeof activate !== 'function') {
        throw new Error(`L'extension ${manifest.id} ne définit pas activate(ctx).`);
      }
      pluginModule = plugin;
      ctx = buildContext(manifest, sdkVersion);
      const cleanup = await activate(ctx);
      activateCleanup = typeof cleanup === 'function' ? cleanup : null;
      post({ kind: 'loaded' });
    } catch (error) {
      post({ kind: 'load-error', error: serializeError(error) });
    }
  };

  const deactivate = async () => {
    try {
      if (typeof pluginModule?.deactivate === 'function') await pluginModule.deactivate(ctx);
      if (activateCleanup) await activateCleanup();
    } catch (error) {
      log('error', ['Erreur pendant deactivate:', error?.message]);
    }
    callbacks.clear();
    eventHandlers.clear();
    configListeners.clear();
    post({ kind: 'deactivated' });
  };

  const invoke = async ({ seq: invokeSeq, callback, args }) => {
    const fn = callbacks.get(callback);
    try {
      if (!fn) throw new Error('Action expirée.');
      const value = await fn(...(args || []));
      post({ kind: 'invoke-result', seq: invokeSeq, ok: true, value: mapData(value, () => undefined) });
    } catch (error) {
      post({ kind: 'invoke-result', seq: invokeSeq, ok: false, error: serializeError(error) });
    }
  };

  const dispatchEvent = ({ name, payload }) => {
    for (const handler of [...(eventHandlers.get(name) || [])]) {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((error) => log('error', [`Erreur pendant ${name}:`, error?.message]));
    }
  };

  return (message) => {
    switch (message?.kind) {
      case 'load':
        load(message);
        break;
      case 'result': {
        const entry = pending.get(message.seq);
        if (!entry) break;
        pending.delete(message.seq);
        if (message.ok) entry.resolve(message.value);
        else entry.reject(deserializeError(message.error));
        break;
      }
      case 'invoke':
        invoke(message);
        break;
      case 'event':
        dispatchEvent(message);
        break;
      case 'config':
        config = message.config || {};
        for (const listener of [...configListeners]) {
          try {
            listener({ ...config });
          } catch (error) {
            log('error', ['Erreur dans config.onChange:', error?.message]);
          }
        }
        break;
      case 'deactivate':
        deactivate();
        break;
      default:
        break;
    }
  };
}
