export const DEFAULT_CATEGORY_LEGEND = {
  cours: { label: 'Cours', color: '#38bdf8' },
  devoir: { label: 'Devoir', color: '#f59e0b' },
  examen: { label: 'Examen', color: '#ef4444' },
  perso: { label: 'Perso', color: '#22c55e' },
  dev: { label: 'Dev', color: '#a78bfa' },
  sport: { label: 'Sport', color: '#14b8a6' },
};

import { normalizeIcsSources } from './icsSources';
import { normalizeAiUsageStats } from './aiUsage';
import { DEFAULT_LOCAL_AI_SETTINGS, normalizeLocalAiSettings } from './localAiSettings';

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  notifications: true,
  aiEnabled: true,
  fontSize: 16,
  dateFormat: 'weekday-short',
  notificationMode: 'normal',
  categoryLegend: DEFAULT_CATEGORY_LEGEND,
  calendarViews: ['year', 'month', 'week', 'day', 'agenda', 'focus', 'stats'],
  shortcuts: {
    commandPalette: 'Ctrl+K',
    snoozeReminder: 'S',
    dismissToast: 'Escape',
  },
  routines: [],
  icsSources: normalizeIcsSources([]),
  themes: [],
  activeThemeId: 'default',
  portableDataDir: '',
  // Sending event locations to OpenStreetMap Nominatim is opt-in.
  mapAutoGeocode: false,
  soundConfig: {
    enabled: true,
    volume: 0.7,
    profile: 'calm',
    bubble: null,
    notification: null,
    ringtone: null,
  },
  aiUsageStats: normalizeAiUsageStats(),
  localAi: DEFAULT_LOCAL_AI_SETTINGS,
};

const CATEGORY_KEYWORDS = [
  ['examen', ['examen', 'exam', 'contrôle', 'controle', 'partiel']],
  ['devoir', ['devoir', 'dm', 'rendu', 'à rendre', 'a rendre']],
  ['cours', ['cours', 'classe', 'td', 'tp']],
  ['dev', ['dev', 'code', 'debug', 'release', 'sprint']],
  ['sport', ['sport', 'match', 'football', 'foot', 'coupe', 'équipe', 'equipe', 'stade', 'finale', 'mondial', '⚽']],
  ['perso', ['perso', 'sport', 'rdv', 'rendez-vous']],
];

export function inferCategory(title = '', fallback = 'perso') {
  const normalized = title.toLocaleLowerCase('fr-FR');
  const match = CATEGORY_KEYWORDS.find(([, words]) => words.some(word => normalized.includes(word)));
  return match?.[0] || fallback;
}

export function normalizeSettings(settings = {}) {
  const safeSettings = { ...settings };
  delete safeSettings.aiApiKey;
  delete safeSettings.aiModel;
  delete safeSettings.customModels;
  const mergedLegend = {
    ...DEFAULT_CATEGORY_LEGEND,
    ...(safeSettings.categoryLegend || {}),
  };

  return {
    ...DEFAULT_SETTINGS,
    ...safeSettings,
    categoryLegend: mergedLegend,
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...(safeSettings.shortcuts || {}),
    },
    calendarViews: safeSettings.calendarViews || DEFAULT_SETTINGS.calendarViews,
    routines: safeSettings.routines || [],
    icsSources: normalizeIcsSources(safeSettings.icsSources || []),
    themes: safeSettings.themes || [],
    aiUsageStats: normalizeAiUsageStats(safeSettings.aiUsageStats),
    localAi: normalizeLocalAiSettings(safeSettings.localAi),
    soundConfig: {
      ...DEFAULT_SETTINGS.soundConfig,
      ...(safeSettings.soundConfig || {}),
    },
  };
}

export function normalizeEvent(event = {}, settings = {}) {
  const legend = settings.categoryLegend || DEFAULT_CATEGORY_LEGEND;
  const category = event.category || inferCategory(event.title);
  const legendEntry = legend[category] || DEFAULT_CATEGORY_LEGEND.perso;
  const sourceCategories = Array.isArray(event.sourceCategories)
    ? event.sourceCategories.filter(Boolean)
    : [];
  const tags = Array.from(new Set([
    ...(Array.isArray(event.tags) ? event.tags : []),
    category,
    ...sourceCategories,
  ].filter(Boolean)));

  return {
    id: event.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    title: event.title || 'Sans titre',
    date: event.date || new Date().toISOString(),
    description: event.description || '',
    reminder: Boolean(event.reminder),
    recurrence: event.recurrence || 'none',
    notifiedOccurrences: event.notifiedOccurrences || {},
    reminderSnoozes: event.reminderSnoozes || {},
    category,
    color: event.color || legendEntry.color,
    tags,
    durationMinutes: Number(event.durationMinutes || event.duration || 60),
    todos: Array.isArray(event.todos) ? event.todos : [],
    source: event.source || 'local',
    importSourceId: event.importSourceId || null,
    importSourceLabel: event.importSourceLabel || '',
    importKey: event.importKey || null,
    examMeta: event.examMeta || null,
    routineId: event.routineId || null,
    originalDate: event.originalDate,
    externalId: event.externalId || event.uid || null,
    uid: event.uid || event.externalId || null,
    sequence: Number.isFinite(Number(event.sequence)) ? Number(event.sequence) : undefined,
    lastModified: event.lastModified || null,
    location: event.location || '',
    url: event.url || '',
    sourceCategories,
    allDay: Boolean(event.allDay),
    status: event.status || '',
    transparency: event.transparency || '',
    endDate: event.endDate || null,
    alarms: Array.isArray(event.alarms) ? event.alarms : [],
    geo: normalizeGeo(event.geo),
    localOverrides: Array.isArray(event.localOverrides) ? event.localOverrides : [],
  };
}

export function normalizeGeo(geo) {
  if (!geo || typeof geo !== 'object') return null;
  const lat = Number(geo.lat);
  const lng = Number(geo.lng ?? geo.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    lat,
    lng,
    source: geo.source || 'manual',
    ...(geo.label && { label: String(geo.label) }),
  };
}

export function normalizeEvents(events = [], settings = {}) {
  return Array.isArray(events) ? events.map(event => normalizeEvent(event, settings)) : [];
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Normalization is pure for a given event object, so cache it per object
// reference. The calendar evaluates the same events hundreds of times per render
// (one call per visible day); this keeps that work proportional to edits.
const normalizedCache = new WeakMap();

export function normalizeEventCached(event) {
  if (!event || typeof event !== 'object') return normalizeEvent(event);
  let normalized = normalizedCache.get(event);
  if (!normalized) {
    normalized = normalizeEvent(event);
    normalizedCache.set(event, normalized);
  }
  return normalized;
}

export function toDayKey(date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function yearlyDayFor(evDate, year) {
  const isLeapYear = new Date(year, 1, 29).getDate() === 29;
  return evDate.getMonth() === 1 && evDate.getDate() === 29 && !isLeapYear ? 28 : evDate.getDate();
}

function buildOccurrence(event, evDate, y, m, d) {
  const occurrenceDate = new Date(y, m, d, evDate.getHours(), evDate.getMinutes(), evDate.getSeconds(), 0);
  return {
    ...event,
    date: occurrenceDate.toISOString(),
    originalDate: event.originalDate || event.date,
    occurrenceKey: `${event.id}:${occurrenceDate.getTime()}`,
  };
}

const byOccurrenceDate = (a, b) => new Date(a.date) - new Date(b.date);

export function getOccurrencesOnDate(events, targetDate) {
  const targetY = targetDate.getFullYear();
  const targetM = targetDate.getMonth();
  const targetD = targetDate.getDate();
  const targetStartOfDay = new Date(targetY, targetM, targetD).getTime();
  const result = [];

  for (const rawEvent of events || []) {
    const event = normalizeEventCached(rawEvent);
    const evDate = new Date(event.originalDate || event.date);
    const evStartOfDay = new Date(evDate.getFullYear(), evDate.getMonth(), evDate.getDate()).getTime();

    if (targetStartOfDay < evStartOfDay) continue;

    let occurs = false;
    if (!event.recurrence || event.recurrence === 'none') {
      occurs = targetStartOfDay === evStartOfDay;
    } else if (event.recurrence === 'daily') {
      occurs = true;
    } else if (event.recurrence === 'weekly') {
      const diffDays = Math.round((targetStartOfDay - evStartOfDay) / 86400000);
      occurs = diffDays % 7 === 0;
    } else if (event.recurrence === 'monthly') {
      const daysInTargetMonth = new Date(targetY, targetM + 1, 0).getDate();
      const targetDay = Math.min(evDate.getDate(), daysInTargetMonth);
      occurs = targetD === targetDay;
    } else if (event.recurrence === 'yearly') {
      occurs = targetM === evDate.getMonth() && targetD === yearlyDayFor(evDate, targetY);
    }

    if (occurs) result.push(buildOccurrence(event, evDate, targetY, targetM, targetD));
  }

  return result.sort(byOccurrenceDate);
}

// Day-keyed occurrence lookup. Buckets hold lightweight entries and are turned
// into full occurrence objects only when a day is actually read, so views that
// just need "is this day busy?" (year view) never pay for materialization.
class OccurrenceIndex {
  constructor() {
    this.pending = new Map();
    this.materialized = new Map();
  }

  add(key, event, evDate, y, m, d) {
    const time = new Date(y, m, d, evDate.getHours(), evDate.getMinutes(), evDate.getSeconds(), 0).getTime();
    const bucket = this.pending.get(key);
    const entry = { event, evDate, y, m, d, time };
    if (bucket) bucket.push(entry);
    else this.pending.set(key, [entry]);
  }

  get size() {
    return this.pending.size;
  }

  has(key) {
    return this.pending.has(key);
  }

  get(key) {
    let occurrences = this.materialized.get(key);
    if (occurrences) return occurrences;
    const bucket = this.pending.get(key);
    if (!bucket) return undefined;
    // Stable sort keeps event order for identical times, like getOccurrencesOnDate.
    occurrences = bucket
      .slice()
      .sort((a, b) => a.time - b.time)
      .map(({ event, evDate, y, m, d }) => buildOccurrence(event, evDate, y, m, d));
    this.materialized.set(key, occurrences);
    return occurrences;
  }

  keys() {
    return this.pending.keys();
  }
}

/**
 * Expands every event into its occurrences between `rangeStart` and `rangeEnd`
 * (inclusive, by calendar day) and groups them by day key (see `toDayKey`).
 *
 * Instead of testing every event against every day (days × events), each
 * recurrence rule jumps straight to its next matching day, so the cost is
 * proportional to the number of occurrences actually produced. Results are
 * identical to calling `getOccurrencesOnDate` for each day of the range.
 */
export function buildOccurrenceIndex(events, rangeStart, rangeEnd) {
  const index = new OccurrenceIndex();
  const startDay = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const endDay = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
  const startTime = startDay.getTime();
  const endTime = endDay.getTime();
  if (endTime < startTime) return index;

  const push = (event, evDate, y, m, d) => index.add(y * 10000 + (m + 1) * 100 + d, event, evDate, y, m, d);

  for (const rawEvent of events || []) {
    const event = normalizeEventCached(rawEvent);
    const evDate = new Date(event.originalDate || event.date);
    if (Number.isNaN(evDate.getTime())) continue;
    const evDay = new Date(evDate.getFullYear(), evDate.getMonth(), evDate.getDate());
    if (evDay.getTime() > endTime) continue;
    const recurrence = event.recurrence || 'none';

    if (recurrence === 'none') {
      if (evDay.getTime() >= startTime) push(event, evDate, evDay.getFullYear(), evDay.getMonth(), evDay.getDate());
    } else if (recurrence === 'daily' || recurrence === 'weekly') {
      const step = recurrence === 'daily' ? 1 : 7;
      const cursor = new Date(evDay);
      if (cursor.getTime() < startTime) {
        const diffDays = Math.round((startTime - cursor.getTime()) / 86400000);
        cursor.setDate(cursor.getDate() + Math.ceil(diffDays / step) * step);
      }
      while (cursor.getTime() <= endTime) {
        push(event, evDate, cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        cursor.setDate(cursor.getDate() + step);
      }
    } else if (recurrence === 'monthly') {
      // Start from whichever month comes later: the event's first month or the range's.
      const from = evDay.getTime() >= startTime ? evDay : startDay;
      let y = from.getFullYear();
      let m = from.getMonth();
      for (;;) {
        const day = Math.min(evDate.getDate(), new Date(y, m + 1, 0).getDate());
        const time = new Date(y, m, day).getTime();
        if (time > endTime) break;
        if (time >= startTime && time >= evDay.getTime()) push(event, evDate, y, m, day);
        m += 1;
        if (m > 11) { m = 0; y += 1; }
      }
    } else if (recurrence === 'yearly') {
      for (let y = Math.max(evDay.getFullYear(), startDay.getFullYear()); y <= endDay.getFullYear(); y += 1) {
        const day = yearlyDayFor(evDate, y);
        const time = new Date(y, evDate.getMonth(), day).getTime();
        if (time >= startTime && time <= endTime && time >= evDay.getTime()) push(event, evDate, y, evDate.getMonth(), day);
      }
    }
  }

  return index;
}

export function getNextOccurrence(event, now = new Date()) {
  const normalized = normalizeEventCached(event);
  const evDate = new Date(normalized.originalDate || normalized.date);
  if (evDate >= now) return evDate;
  if (!normalized.recurrence || normalized.recurrence === 'none') return null;

  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    evDate.getHours(),
    evDate.getMinutes(),
    evDate.getSeconds(),
  );
  if (candidate < now) candidate.setDate(candidate.getDate() + 1);

  for (let guard = 0; guard < 370; guard += 1) {
    let isValid = false;
    if (normalized.recurrence === 'daily') {
      isValid = true;
    } else if (normalized.recurrence === 'weekly') {
      isValid = candidate.getDay() === evDate.getDay();
    } else if (normalized.recurrence === 'monthly') {
      const daysInMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
      isValid = candidate.getDate() === Math.min(evDate.getDate(), daysInMonth);
    } else if (normalized.recurrence === 'yearly') {
      isValid = candidate.getMonth() === evDate.getMonth()
        && candidate.getDate() === yearlyDayFor(evDate, candidate.getFullYear());
    }

    if (isValid) return candidate;
    candidate.setDate(candidate.getDate() + 1);
  }

  return null;
}

export function formatEventDate(value, settings = {}, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  const format = settings.dateFormat || 'weekday-short';
  const includeTime = options.includeTime !== false;
  const base = format === 'numeric'
    ? { day: '2-digit', month: '2-digit', year: 'numeric' }
    : format === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short' };

  return date.toLocaleString('fr-FR', {
    ...base,
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function getWeekRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
