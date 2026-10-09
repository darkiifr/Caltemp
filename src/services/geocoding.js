import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isGeocodableLocation, normalizeLocationKey } from '../domain/geo';
import { loadDataJson, saveDataJson } from './fileManager';

// Free-text location -> coordinates through OpenStreetMap Nominatim.
// Nominatim's usage policy allows at most one request per second and asks
// clients to cache results, identify themselves and avoid repeated queries:
// requests go through a single throttled queue, identical lookups share one
// request, and every answer (including "not found") is cached on disk.

const CACHE_FILE = 'geocache.json';
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Caltemp/6 (desktop calendar; https://github.com/darkiifr/Caltemp)';
const MIN_INTERVAL_MS = 1100;
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
const SAVE_DEBOUNCE_MS = 1500;

export function buildGeocodeQueries(text = '') {
  const parts = String(text).split(',').map(part => part.trim()).filter(Boolean);
  const queries = [parts.join(', ')];
  for (let start = 1; parts.length - start >= 2 && queries.length < 3; start += 1) {
    queries.push(parts.slice(start).join(', '));
  }
  return queries;
}

export function createGeocoder({
  fetcher = globalThis.fetch,
  storage = null,
  now = () => Date.now(),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const cache = new Map();
  const inflight = new Map();
  const listeners = new Set();
  let queue = Promise.resolve();
  let lastRequestAt = 0;
  let loaded = null;
  let saveTimer = null;
  let version = 0;

  const notify = () => {
    version += 1;
    for (const listener of listeners) listener(version);
  };

  function load() {
    if (!loaded) {
      loaded = (async () => {
        const data = storage ? await storage.load(CACHE_FILE) : null;
        for (const [key, entry] of Object.entries(data?.entries || {})) {
          if (!cache.has(key)) cache.set(key, entry);
        }
        if (cache.size) notify();
      })().catch(error => console.error('Geocode cache load failed:', error));
    }
    return loaded;
  }

  function scheduleSave() {
    if (!storage) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // Keep the newest entries only.
      const entries = Array.from(cache.entries())
        .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
        .slice(0, MAX_ENTRIES);
      storage.save(CACHE_FILE, { version: 1, entries: Object.fromEntries(entries) })
        .catch(error => console.error('Geocode cache save failed:', error));
    }, SAVE_DEBOUNCE_MS);
  }

  function isFresh(entry) {
    if (!entry) return false;
    if (entry.lat != null) return true;
    return now() - (entry.at || 0) < MISS_TTL_MS;
  }

  /** Synchronous cache read; `undefined` = never asked, `null` = known miss. */
  function peek(text) {
    const entry = cache.get(normalizeLocationKey(text));
    if (!isFresh(entry)) return undefined;
    return entry.lat != null ? { lat: entry.lat, lng: entry.lng, label: entry.label, source: 'geocoded' } : null;
  }

  async function requestOnce(query) {
    const elapsed = now() - lastRequestAt;
    if (elapsed < MIN_INTERVAL_MS) await wait(MIN_INTERVAL_MS - elapsed);
    lastRequestAt = now();
    const url = `${ENDPOINT}?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', 'accept-language': 'fr' })}`;
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 'inconnu'}`);
    const [hit] = await response.json();
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng, label: hit.display_name || query }
      : null;
  }

  // "Lycée Henri-IV, 23 rue Clovis, Paris" mixes a place name with its address,
  // which Nominatim often cannot match as a whole: on a miss, retry without the
  // leading parts, as long as at least "street, city" remains.
  async function request(text) {
    for (const query of buildGeocodeQueries(text)) {
      const hit = await requestOnce(query);
      if (hit) return hit;
    }
    return null;
  }

  function geocode(text) {
    const key = normalizeLocationKey(text);
    if (!key || !isGeocodableLocation(text)) return Promise.resolve(null);
    const known = peek(text);
    if (known !== undefined) return Promise.resolve(known);
    if (inflight.has(key)) return inflight.get(key);

    const task = queue.then(async () => {
      await load();
      const cached = peek(text);
      if (cached !== undefined) return cached;
      try {
        const hit = await request(text);
        cache.set(key, hit ? { ...hit, at: now() } : { lat: null, at: now() });
        scheduleSave();
        notify();
        return hit ? { ...hit, source: 'geocoded' } : null;
      } catch (error) {
        // Network errors are not cached: the next attempt will retry.
        console.warn('Geocoding failed:', error);
        return null;
      }
    }).finally(() => inflight.delete(key));
    queue = task.catch(() => null);
    inflight.set(key, task);
    return task;
  }

  return {
    load,
    peek,
    geocode,
    geocodeMany: async (texts, onProgress) => {
      const unique = Array.from(new Map(texts.map(text => [normalizeLocationKey(text), text])).values());
      let done = 0;
      for (const text of unique) {
        await geocode(text);
        done += 1;
        onProgress?.(done, unique.length);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}

let sharedGeocoder = null;

export function getGeocoder() {
  if (!sharedGeocoder) {
    const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
    const geocoder = createGeocoder({
      fetcher: isTauri ? tauriFetch : globalThis.fetch,
      storage: isTauri ? { load: name => loadDataJson(name), save: saveDataJson } : null,
    });
    geocoder.load();
    sharedGeocoder = Promise.resolve(geocoder);
  }
  return sharedGeocoder;
}
