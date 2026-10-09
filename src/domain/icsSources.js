export const DEFAULT_ICS_SOURCES = [
  {
    id: 'fr-holidays',
    label: 'Jours fériés France',
    type: 'url',
    url: 'https://calendrier.api.gouv.fr/jours-feries/metropole.ics',
    helpUrl: 'https://calendrier.api.gouv.fr/jours-feries/',
    enabled: false,
    preset: true,
  },
  {
    id: 'google-calendar-private',
    label: 'Google Calendar - URL secrète ICS',
    type: 'url',
    url: '',
    enabled: false,
    preset: true,
    needsUrl: true,
    helpUrl: 'https://support.google.com/calendar/answer/37648',
  },
  {
    id: 'outlook-calendar-published',
    label: 'Outlook / Microsoft 365 - calendrier publié',
    type: 'url',
    url: '',
    enabled: false,
    preset: true,
    needsUrl: true,
    helpUrl: 'https://support.microsoft.com/office/share-your-calendar-in-outlook-com-0fc1cb48-569d-4d1e-ac20-d27b9a3c6a60',
  },
  {
    id: 'icloud-calendar-public',
    label: 'Apple iCloud - calendrier public',
    type: 'url',
    url: '',
    enabled: false,
    preset: true,
    needsUrl: true,
    helpUrl: 'https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud',
  },
  {
    id: 'moodle-ent-calendar',
    label: 'Moodle / ENT - export calendrier ICS',
    type: 'url',
    url: '',
    enabled: false,
    preset: true,
    needsUrl: true,
    helpUrl: 'https://docs.moodle.org/en/Calendar_export',
  },
  {
    id: 'office-holidays-fr',
    label: 'Office Holidays - France',
    type: 'url',
    url: 'https://www.officeholidays.com/ics/france',
    helpUrl: 'https://www.officeholidays.com/subscribe',
    enabled: false,
    preset: true,
  },
  {
    id: 'calendarlabs-fr',
    label: 'CalendarLabs - France holidays',
    type: 'url',
    url: 'https://www.calendarlabs.com/ical-calendar/ics/76/France_Holidays.ics',
    helpUrl: 'https://www.calendarlabs.com/ical-calendar/france-holidays-76/',
    enabled: false,
    preset: true,
  },
];

export const DEFAULT_ICS_REFRESH_MINUTES = 5;
export const MIN_ICS_REFRESH_MINUTES = 1;

export function getIcsRefreshMinutes(source = {}) {
  const minutes = Number(source.refreshMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return DEFAULT_ICS_REFRESH_MINUTES;
  return Math.max(MIN_ICS_REFRESH_MINUTES, minutes);
}

function withSyncDefaults(source) {
  return {
    ...source,
    defaultCategory: source.defaultCategory || 'perso',
    defaultReminder: Boolean(source.defaultReminder),
    refreshMinutes: getIcsRefreshMinutes(source),
    lastSyncedAt: source.lastSyncedAt || '',
    lastSyncStatus: source.lastSyncStatus || '',
    lastSyncMessage: source.lastSyncMessage || '',
    // HTTP validators and a content fingerprint let refreshes skip unchanged feeds.
    etag: source.etag || '',
    httpLastModified: source.httpLastModified || '',
    contentHash: source.contentHash || '',
    failureCount: Math.max(0, Number(source.failureCount) || 0),
  };
}

export function normalizeIcsSources(sources = []) {
  const byId = new Map(DEFAULT_ICS_SOURCES.map(source => [source.id, source]));
  for (const source of sources) {
    const id = source.id || `${source.type || 'url'}-${source.label || source.url || source.path}`;
    byId.set(id, {
      ...source,
      id,
      label: source.label || source.url || source.path || 'Calendrier ICS',
      type: source.type || (source.path ? 'file' : 'url'),
      url: source.url || '',
      path: source.path || '',
      enabled: source.enabled !== false,
      preset: Boolean(source.preset),
      needsUrl: Boolean(source.needsUrl),
      helpUrl: source.helpUrl || '',
    });
  }
  return Array.from(byId.values(), withSyncDefaults);
}

export function addIcsSource(sources, source) {
  return normalizeIcsSources([...sources, source]);
}

function getSourceUrlFingerprint(value = '') {
  try {
    const url = new URL(String(value || '').trim().replace(/^webcals?:\/\//i, 'https://'));
    if (url.protocol !== 'https:') return '';
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.port === '443') url.port = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

export function findIcsSourceByUrl(sources = [], url = '') {
  const fingerprint = getSourceUrlFingerprint(url);
  if (!fingerprint) return null;
  return normalizeIcsSources(sources).find(source => getSourceUrlFingerprint(source.url || '') === fingerprint) || null;
}

export function removeIcsSource(sources = [], sourceId = '') {
  return normalizeIcsSources(sources).filter(source => source.id !== sourceId);
}

// Status written by background syncs (never edited by the user).
export const ICS_SYNC_STATE_FIELDS = [
  'lastSyncedAt', 'lastSyncStatus', 'lastSyncMessage', 'lastFullSyncAt',
  'etag', 'httpLastModified', 'contentHash', 'failureCount', 'dismissedKeys',
];

const MAX_DISMISSED_KEYS = 2000;

export function addDismissedIcsKey(keys = [], key = '') {
  if (!key) return Array.isArray(keys) ? keys : [];
  const next = (Array.isArray(keys) ? keys : []).filter(item => item !== key);
  next.push(key);
  return next.slice(-MAX_DISMISSED_KEYS);
}

function pickSyncState(source = {}) {
  const state = {};
  for (const field of ICS_SYNC_STATE_FIELDS) {
    if (source[field] !== undefined) state[field] = source[field];
  }
  return state;
}

/**
 * Keeps the user's edits to `sources` while taking the sync status from
 * `liveSources`, so a stale copy (e.g. an open settings form) never rolls back
 * what background syncs recorded.
 */
export function mergeIcsSyncState(sources = [], liveSources = []) {
  const liveById = new Map(liveSources.map(source => [source.id, source]));
  return normalizeIcsSources(sources.map(source => {
    const live = liveById.get(source.id);
    return live ? { ...source, ...pickSyncState(live) } : source;
  }));
}

