import { startGuest } from './guest.js';

// Plugin code shares this worker with the guest runtime but not with the app:
// no DOM, no app state, no Tauri IPC. Direct network APIs are removed too, so
// requests go through `ctx.http.fetch`, which enforces the manifest's hosts.
const BLOCKED_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebSocketStream',
  'EventSource',
  'WebTransport',
  'importScripts',
  'indexedDB',
  'caches',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
];

function harden(scope) {
  for (const name of BLOCKED_GLOBALS) {
    let target = scope;
    while (target) {
      try {
        delete target[name];
      } catch {
        // Non-configurable on this engine: shadowed below.
      }
      target = Object.getPrototypeOf(target);
    }
    try {
      Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false });
    } catch {
      // Already non-configurable: nothing more we can do for this name.
    }
  }
}

const post = self.postMessage.bind(self);
const createObjectURL = URL.createObjectURL.bind(URL);
const revokeObjectURL = URL.revokeObjectURL.bind(URL);
const BlobCtor = Blob;

const handle = startGuest({
  post: (message) => post(message),
  importModule: async (code) => {
    const url = createObjectURL(new BlobCtor([code], { type: 'text/javascript' }));
    try {
      return await import(/* @vite-ignore */ url);
    } finally {
      revokeObjectURL(url);
    }
  },
});

harden(self);

self.addEventListener('message', (event) => handle(event.data));
