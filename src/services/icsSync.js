import { parseICS } from '../utils/ics';
import { applyIcsImportOptions, validateIcsUrl } from '../domain/icsImport';
import { normalizeEvent, normalizeEvents } from '../domain/events';

const MAX_ICS_BYTES = 5 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

function eventImportKey(event = {}, sourceId = '') {
  return event.importKey || (sourceId && event.externalId ? `${sourceId}:${event.externalId}` : null);
}

function syncMessage(stats) {
  return `${stats.added} ajouté(s), ${stats.updated} mis à jour, ${stats.removed} retiré(s)`;
}

function getHeader(response, name) {
  if (!response?.headers) return '';
  if (typeof response.headers.get === 'function') return response.headers.get(name) || '';
  return response.headers[name] || response.headers[name.toLowerCase()] || '';
}

function assertValidIcsContent(content) {
  if (typeof content !== 'string' || !/BEGIN:VCALENDAR/i.test(content) || !/END:VCALENDAR/i.test(content)) {
    throw new Error('Le contenu reçu n’est pas un calendrier ICS valide.');
  }
  if (new Blob([content]).size > MAX_ICS_BYTES) {
    throw new Error('Le calendrier ICS est trop volumineux.');
  }
}

async function fetchIcsText(url, fetcher, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { method: 'GET', signal: controller.signal });
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 'inconnu'}`);

    const contentLength = Number(getHeader(response, 'content-length') || 0);
    if (contentLength > MAX_ICS_BYTES) {
      throw new Error('Le calendrier ICS est trop volumineux.');
    }

    const content = await response.text();
    assertValidIcsContent(content);
    return content;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('La synchronisation a expiré.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
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
    if (event.source === 'ics-url' && event.importSourceId === sourceId) {
      const key = eventImportKey(event, sourceId);
      const replacement = key ? importedByKey.get(key) : null;
      if (replacement) {
        nextEvents.push(normalizeEvent({
          ...event,
          ...replacement,
          id: event.id,
          notifiedOccurrences: event.notifiedOccurrences,
          reminderSnoozes: event.reminderSnoozes,
        }, settings));
        consumed.add(key);
        stats.updated += 1;
      } else {
        stats.removed += 1;
      }
    } else {
      nextEvents.push(event);
    }
  }

  for (const [key, event] of importedByKey.entries()) {
    if (consumed.has(key)) continue;
    nextEvents.push(event);
    stats.added += 1;
  }

  return { events: nextEvents, stats };
}

export async function syncIcsSource({ source, events = [], settings = {}, fetcher = globalThis.fetch, now = new Date() }) {
  const validation = validateIcsUrl(source?.url || '');
  if (!source?.enabled || source.type !== 'url' || !validation.ok) {
    return { events, source, stats: { added: 0, updated: 0, removed: 0 }, skipped: true };
  }

  try {
    const content = await fetchIcsText(validation.normalizedUrl, fetcher);
    const parsed = parseICS(content);
    const prepared = applyIcsImportOptions(parsed, {
      sourceId: source.id,
      sourceLabel: source.label || source.url,
      defaultCategory: source.defaultCategory,
      defaultReminder: Boolean(source.defaultReminder),
      preferInferredCategory: true,
    });
    const normalizedImports = normalizeEvents(prepared, settings);
    const result = upsertIcsSourceEvents({
      existingEvents: events,
      importedEvents: normalizedImports,
      sourceId: source.id,
      settings,
    });
    const nextSource = {
      ...source,
      lastSyncedAt: now.toISOString(),
      lastSyncStatus: 'ok',
      lastSyncMessage: syncMessage(result.stats),
    };

    return { ...result, source: nextSource };
  } catch (error) {
    return {
      events,
      source: {
        ...source,
        lastSyncedAt: now.toISOString(),
        lastSyncStatus: 'error',
        lastSyncMessage: error.message || String(error),
      },
      stats: { added: 0, updated: 0, removed: 0 },
      error,
    };
  }
}
