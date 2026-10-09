import { parseICS } from '../utils/ics';
import { applyIcsImportOptions, validateIcsUrl } from '../domain/icsImport';
import { normalizeEvent, normalizeEvents } from '../domain/events';

const MAX_ICS_BYTES = 5 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
// Recurring series are expanded over a sliding window, so even an unchanged
// feed is fully re-read once a day to move that window forward.
const FULL_REFRESH_MS = 24 * 60 * 60 * 1000;
const EMPTY_STATS = Object.freeze({ added: 0, updated: 0, removed: 0 });

// Fields a sync writes from the feed (or from the source's import options).
// When the user edits one of them on a subscribed event, the field is recorded
// in `localOverrides` and later syncs leave it alone.
export const ICS_SYNCED_FIELDS = [
  'title', 'date', 'endDate', 'description', 'location', 'url', 'allDay',
  'durationMinutes', 'recurrence', 'status', 'transparency', 'sequence',
  'lastModified', 'geo', 'sourceCategories', 'alarms', 'importSourceLabel',
  'reminder', 'category', 'color', 'tags',
];
// Local bookkeeping that the feed never knows about.
const LOCAL_STATE_FIELDS = ['notifiedOccurrences', 'reminderSnoozes', 'todos'];

function eventImportKey(event = {}, sourceId = '') {
  return event.importKey || (sourceId && event.externalId ? `${sourceId}:${event.externalId}` : null);
}

function syncMessage(stats) {
  if (!stats.added && !stats.updated && !stats.removed) return 'À jour, aucun changement';
  return `${stats.added} ajouté(s), ${stats.updated} mis à jour, ${stats.removed} retiré(s)`;
}

function getHeader(response, name) {
  if (!response?.headers) return '';
  if (typeof response.headers.get === 'function') return response.headers.get(name) || '';
  return response.headers[name] || response.headers[name.toLowerCase()] || '';
}

function sameValue(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffEventFields(previous = {}, next = {}, fields = ICS_SYNCED_FIELDS) {
  return fields.filter(field => !sameValue(previous[field], next[field]));
}

// FNV-1a over the feed text plus the import options that shape the result.
export function hashIcsContent(content = '', salt = '') {
  let hash = 0x811c9dc5;
  const input = `${salt}\u0000${content}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(36)}-${input.length.toString(36)}`;
}

function importSalt(source) {
  return [source.label || source.url, source.defaultCategory || '', Boolean(source.defaultReminder)].join('|');
}

function assertValidIcsContent(content) {
  if (typeof content !== 'string' || !/BEGIN:VCALENDAR/i.test(content) || !/END:VCALENDAR/i.test(content)) {
    throw new Error('Le contenu reçu n’est pas un calendrier ICS valide.');
  }
  if (new Blob([content]).size > MAX_ICS_BYTES) {
    throw new Error('Le calendrier ICS est trop volumineux.');
  }
}

async function fetchIcsText(url, fetcher, { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, etag = '', lastModified = '' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {};
  if (etag) headers['If-None-Match'] = etag;
  if (lastModified) headers['If-Modified-Since'] = lastModified;
  try {
    const response = await fetcher(url, {
      method: 'GET',
      signal: controller.signal,
      ...(Object.keys(headers).length && { headers }),
    });
    if (response?.status === 304) return { notModified: true };
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 'inconnu'}`);

    const contentLength = Number(getHeader(response, 'content-length') || 0);
    if (contentLength > MAX_ICS_BYTES) {
      throw new Error('Le calendrier ICS est trop volumineux.');
    }

    const content = await response.text();
    assertValidIcsContent(content);
    return {
      content,
      etag: getHeader(response, 'etag'),
      lastModified: getHeader(response, 'last-modified'),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('La synchronisation a expiré.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function hasSourceEvents(events, sourceId) {
  return events.some(event => event.source === 'ics-url' && event.importSourceId === sourceId);
}

/**
 * Network half of a subscription refresh: downloads and parses the feed but
 * does not touch events. Keeping it separate lets the caller merge the result
 * into the *latest* events once the download is done, instead of a snapshot
 * taken before a request that can take seconds.
 */
export async function fetchIcsSource({
  source,
  events = [],
  settings = {},
  fetcher = globalThis.fetch,
  now = new Date(),
  force = false,
}) {
  const validation = validateIcsUrl(source?.url || '');
  if (!source?.enabled || source.type !== 'url' || !validation.ok) {
    return { status: 'skipped', source };
  }

  const syncedAt = now.toISOString();
  const lastFullSync = source.lastFullSyncAt ? new Date(source.lastFullSyncAt).getTime() : 0;
  const canSkip = !force
    && hasSourceEvents(events, source.id)
    && now.getTime() - lastFullSync < FULL_REFRESH_MS;

  try {
    const response = await fetchIcsText(validation.normalizedUrl, fetcher, canSkip
      ? { etag: source.etag, lastModified: source.httpLastModified }
      : {});

    const contentHash = response.notModified ? source.contentHash : hashIcsContent(response.content, importSalt(source));
    if (response.notModified || (canSkip && contentHash && contentHash === source.contentHash)) {
      return {
        status: 'unchanged',
        source: {
          ...source,
          etag: response.etag || source.etag || '',
          httpLastModified: response.lastModified || source.httpLastModified || '',
          lastSyncedAt: syncedAt,
          lastSyncStatus: 'ok',
          lastSyncMessage: syncMessage(EMPTY_STATS),
          failureCount: 0,
        },
      };
    }

    const parsed = parseICS(response.content, { now });
    const prepared = applyIcsImportOptions(parsed, {
      sourceId: source.id,
      sourceLabel: source.label || source.url,
      defaultCategory: source.defaultCategory,
      defaultReminder: Boolean(source.defaultReminder),
      preferInferredCategory: true,
    });

    const dismissed = new Set(source.dismissedKeys || []);
    return {
      status: 'changed',
      importedEvents: normalizeEvents(dismissed.size ? prepared.filter(event => !dismissed.has(event.importKey)) : prepared, settings),
      source: {
        ...source,
        etag: response.etag || '',
        httpLastModified: response.lastModified || '',
        contentHash,
        lastFullSyncAt: syncedAt,
        lastSyncedAt: syncedAt,
        lastSyncStatus: 'ok',
        failureCount: 0,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      error,
      source: {
        ...source,
        lastSyncedAt: syncedAt,
        lastSyncStatus: 'error',
        lastSyncMessage: error.message || String(error),
        failureCount: (Number(source.failureCount) || 0) + 1,
      },
    };
  }
}

export function upsertIcsSourceEvents({ existingEvents = [], importedEvents = [], sourceId, settings = {} }) {
  const importedByKey = new Map();
  for (const rawEvent of importedEvents) {
    const event = normalizeEvent(rawEvent, settings);
    const key = eventImportKey(event, sourceId);
    if (key) importedByKey.set(key, event);
  }

  const stats = { added: 0, updated: 0, removed: 0 };
  const nextEvents = [];
  const consumed = new Set();

  for (const event of existingEvents) {
    if (event.source !== 'ics-url' || event.importSourceId !== sourceId) {
      nextEvents.push(event);
      continue;
    }

    const key = eventImportKey(event, sourceId);
    const replacement = key ? importedByKey.get(key) : null;
    if (!replacement || consumed.has(key)) {
      stats.removed += 1;
      continue;
    }
    consumed.add(key);

    const overrides = new Set(event.localOverrides || []);
    const remoteChanges = ICS_SYNCED_FIELDS.filter(field => !overrides.has(field) && !sameValue(event[field], replacement[field]));
    if (!remoteChanges.length) {
      // Unchanged: keep the same object so memoised views skip it.
      nextEvents.push(event);
      continue;
    }

    const merged = { ...event };
    for (const field of remoteChanges) merged[field] = replacement[field];
    for (const field of LOCAL_STATE_FIELDS) merged[field] = event[field];
    nextEvents.push(normalizeEvent(merged, settings));
    stats.updated += 1;
  }

  for (const [key, event] of importedByKey.entries()) {
    if (consumed.has(key)) continue;
    nextEvents.push(event);
    stats.added += 1;
  }

  return { events: nextEvents, stats };
}

/**
 * Merges a `fetchIcsSource` result into `events`. Returns the same array when
 * nothing changed, so callers can skip re-rendering and disk writes.
 */
export function applyIcsFetchResult({ events = [], result, settings = {} }) {
  if (result?.status !== 'changed') {
    return { events, source: result?.source, stats: { ...EMPTY_STATS }, changed: false };
  }
  const upsert = upsertIcsSourceEvents({
    existingEvents: events,
    importedEvents: result.importedEvents,
    sourceId: result.source.id,
    settings,
  });
  const changed = upsert.stats.added + upsert.stats.updated + upsert.stats.removed > 0;
  return {
    events: changed ? upsert.events : events,
    stats: upsert.stats,
    changed,
    source: { ...result.source, lastSyncMessage: syncMessage(upsert.stats) },
  };
}

export async function syncIcsSource({ source, events = [], settings = {}, fetcher = globalThis.fetch, now = new Date(), force = true }) {
  const result = await fetchIcsSource({ source, events, settings, fetcher, now, force });
  if (result.status === 'skipped') {
    return { events, source, stats: { ...EMPTY_STATS }, skipped: true };
  }
  if (result.status === 'error') {
    return { events, source: result.source, stats: { ...EMPTY_STATS }, error: result.error };
  }
  const applied = applyIcsFetchResult({ events, result, settings });
  return { events: applied.events, source: applied.source, stats: applied.stats, changed: applied.changed };
}
