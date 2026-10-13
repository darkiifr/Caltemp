import { PLUGIN_ACTIVATION_TIMEOUT_MS } from '../constants.js';
import { deserializeError, isCallbackRef, mapData, serializeError, CALLBACK_KEY } from './protocol.js';

const DEACTIVATE_TIMEOUT_MS = 2000;
const INVOKE_TIMEOUT_MS = 30000;

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Host side of one running plugin: answers its `call` messages with the
 * plugin API, turns callback references back into functions, forwards app
 * events and tears everything down on `stop()`.
 */
export class PluginConnection {
  constructor({ manifest, transport, api, logger = console, onCrash }) {
    this.manifest = manifest;
    this.transport = transport;
    this.api = api;
    this.logger = logger;
    this.onCrash = onCrash;
    this.invokeSeq = 0;
    this.pendingInvokes = new Map();
    this.loadWaiter = null;
    this.stopWaiter = null;
    this.stopped = false;
    transport.onMessage((message) => this.handleMessage(message));
  }

  start({ code = '', config = {}, sdkVersion }) {
    const loaded = new Promise((resolve, reject) => {
      this.loadWaiter = { resolve, reject };
    });
    this.transport.post({ kind: 'load', code, manifest: this.manifest, config, sdkVersion });
    return withTimeout(
      loaded,
      PLUGIN_ACTIVATION_TIMEOUT_MS,
      `L'extension ${this.manifest.id} n'a pas terminé activate() à temps.`,
    ).catch((error) => {
      this.terminate();
      throw error;
    });
  }

  async stop() {
    if (this.stopped) return;
    const stopped = new Promise((resolve) => {
      this.stopWaiter = resolve;
    });
    this.transport.post({ kind: 'deactivate' });
    await withTimeout(stopped, DEACTIVATE_TIMEOUT_MS, 'deactivate trop long').catch((error) => {
      this.logger.warn?.(`[${this.manifest.id}]`, error.message);
    });
    this.terminate();
  }

  terminate() {
    if (this.stopped) return;
    this.stopped = true;
    this.api.dispose();
    this.transport.terminate();
    for (const { reject } of this.pendingInvokes.values()) reject(new Error('Extension arrêtée.'));
    this.pendingInvokes.clear();
  }

  dispatchEvent(name, payload) {
    if (this.stopped || !this.api.isSubscribed(name)) return;
    this.transport.post({ kind: 'event', name, payload });
  }

  pushConfig(config) {
    if (!this.stopped) this.transport.post({ kind: 'config', config });
  }

  // Callback references become async functions that run the plugin's code.
  decode(args) {
    return mapData(args, (value) => {
      if (!isCallbackRef(value)) return undefined;
      const callback = value[CALLBACK_KEY];
      return (...callArgs) => this.invoke(callback, callArgs);
    });
  }

  invoke(callback, args) {
    if (this.stopped) return Promise.reject(new Error('Extension arrêtée.'));
    this.invokeSeq += 1;
    const seq = this.invokeSeq;
    const result = new Promise((resolve, reject) => {
      this.pendingInvokes.set(seq, { resolve, reject });
    });
    this.transport.post({ kind: 'invoke', seq, callback, args: mapData(args, () => undefined) || [] });
    return withTimeout(result, INVOKE_TIMEOUT_MS, 'Action d’extension trop longue.')
      .finally(() => this.pendingInvokes.delete(seq));
  }

  async handleCall({ seq, method, args }) {
    try {
      const fn = this.api.methods[method];
      if (typeof fn !== 'function') throw new Error(`API inconnue: ${method}`);
      const decodedArgs = this.decode(Array.isArray(args) ? args : []);
      const value = await fn(...decodedArgs);
      if (!this.stopped) {
        this.transport.post({ kind: 'result', seq, ok: true, value: mapData(value, () => undefined) });
      }
    } catch (error) {
      if (!this.stopped) {
        this.transport.post({ kind: 'result', seq, ok: false, error: serializeError(error) });
      }
    }
  }

  handleMessage(message) {
    if (this.stopped || !message || typeof message !== 'object') return;
    switch (message.kind) {
      case 'call':
        this.handleCall(message);
        break;
      case 'invoke-result': {
        const entry = this.pendingInvokes.get(message.seq);
        if (!entry) break;
        if (message.ok) entry.resolve(message.value);
        else entry.reject(deserializeError(message.error));
        break;
      }
      case 'loaded':
        this.loadWaiter?.resolve();
        this.loadWaiter = null;
        break;
      case 'load-error':
        this.loadWaiter?.reject(deserializeError(message.error));
        this.loadWaiter = null;
        break;
      case 'deactivated':
        this.stopWaiter?.();
        break;
      case 'log': {
        const level = ['debug', 'info', 'warn', 'error'].includes(message.level) ? message.level : 'info';
        this.logger[level]?.(`[${this.manifest.id}]`, ...(Array.isArray(message.args) ? message.args : []));
        break;
      }
      case 'crash': {
        const error = deserializeError(message.error);
        if (this.loadWaiter) {
          this.loadWaiter.reject(error);
          this.loadWaiter = null;
        } else {
          this.onCrash?.(error);
        }
        break;
      }
      default:
        break;
    }
  }
}
