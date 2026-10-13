import { PLUGIN_STORAGE_MAX_BYTES } from './constants.js';
import { cloneData } from './sandbox/protocol.js';

const WRITE_DELAY_MS = 300;

function validateKey(key) {
  if (typeof key !== 'string' || !key || key.length > 200) {
    throw new Error('La clé de stockage doit être une chaîne non vide.');
  }
  return key;
}

/**
 * Private key/value storage per extension. Values are JSON data, cached in
 * memory and written back to disk shortly after the last change.
 *
 * @param {object} backend `{ read(extensionId) -> object, write(extensionId, data) }`;
 *   omit it for memory-only storage.
 */
export function createExtensionStorage(backend = null) {
  const caches = new Map();
  const timers = new Map();

  const load = async (extensionId) => {
    if (!caches.has(extensionId)) {
      caches.set(extensionId, (async () => {
        try {
          const data = backend ? await backend.read(extensionId) : null;
          return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        } catch {
          return {};
        }
      })());
    }
    return caches.get(extensionId);
  };

  const flush = async (extensionId) => {
    clearTimeout(timers.get(extensionId));
    timers.delete(extensionId);
    if (!backend || !caches.has(extensionId)) return;
    await backend.write(extensionId, await caches.get(extensionId));
  };

  const scheduleWrite = (extensionId) => {
    if (!backend) return;
    clearTimeout(timers.get(extensionId));
    timers.set(extensionId, setTimeout(() => {
      flush(extensionId).catch((error) => console.error(`Stockage ${extensionId}:`, error));
    }, WRITE_DELAY_MS));
  };

  return {
    forExtension(extensionId) {
      return {
        get: async (key) => cloneData((await load(extensionId))[validateKey(key)]),
        set: async (key, value) => {
          const data = await load(extensionId);
          const next = { ...data, [validateKey(key)]: cloneData(value) };
          if (JSON.stringify(next).length > PLUGIN_STORAGE_MAX_BYTES) {
            throw new Error('Stockage de l’extension plein (1 Mo maximum).');
          }
          caches.set(extensionId, Promise.resolve(next));
          scheduleWrite(extensionId);
        },
        remove: async (key) => {
          const data = { ...(await load(extensionId)) };
          delete data[validateKey(key)];
          caches.set(extensionId, Promise.resolve(data));
          scheduleWrite(extensionId);
        },
        keys: async () => Object.keys(await load(extensionId)),
        clear: async () => {
          caches.set(extensionId, Promise.resolve({}));
          scheduleWrite(extensionId);
        },
      };
    },
    flush,
    async flushAll() {
      await Promise.all([...timers.keys()].map(flush));
    },
    forget(extensionId) {
      clearTimeout(timers.get(extensionId));
      timers.delete(extensionId);
      caches.delete(extensionId);
    },
  };
}
