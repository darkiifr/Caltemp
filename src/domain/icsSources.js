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

export function normalizeIcsSources(sources = []) {
  const byId = new Map(DEFAULT_ICS_SOURCES.map(source => [source.id, source]));
  for (const source of sources) {
    const id = source.id || `${source.type || 'url'}-${source.label || source.url || source.path}`;
    byId.set(id, {
      id,
      label: source.label || source.url || source.path || 'Calendrier ICS',
      type: source.type || (source.path ? 'file' : 'url'),
      url: source.url || '',
      path: source.path || '',
      enabled: source.enabled !== false,
      preset: Boolean(source.preset),
      needsUrl: Boolean(source.needsUrl),
      helpUrl: source.helpUrl || '',
      defaultCategory: source.defaultCategory || 'perso',
      defaultReminder: Boolean(source.defaultReminder),
      refreshMinutes: Number(source.refreshMinutes || 15),
      lastSyncedAt: source.lastSyncedAt || '',
      lastSyncStatus: source.lastSyncStatus || '',
      lastSyncMessage: source.lastSyncMessage || '',
    });
  }
  return Array.from(byId.values()).map(source => ({
    ...source,
    defaultCategory: source.defaultCategory || 'perso',
    defaultReminder: Boolean(source.defaultReminder),
    refreshMinutes: Number(source.refreshMinutes || 15),
    lastSyncedAt: source.lastSyncedAt || '',
    lastSyncStatus: source.lastSyncStatus || '',
    lastSyncMessage: source.lastSyncMessage || '',
  }));
}

export function addIcsSource(sources, source) {
  return normalizeIcsSources([...sources, source]);
}

function getSourceUrlFingerprint(value = '') {
  try {
    const url = new URL(String(value || '').trim());
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
