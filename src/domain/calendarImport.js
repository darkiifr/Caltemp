// Advanced import from other calendar apps: format/provider detection,
// CSV exports (Google Agenda, Outlook, generic), duplicate analysis and the
// final merge into existing events.

export const IMPORT_FILE_EXTENSIONS = ['ics', 'ical', 'icalendar', 'ifb', 'vcs', 'csv', 'zip'];

export const IMPORT_PROVIDERS = [
  {
    id: 'google',
    label: 'Google Agenda',
    formats: ['zip', 'ics', 'csv'],
    steps: [
      'Ouvrez Google Agenda sur ordinateur, puis Paramètres (roue dentée).',
      'Dans « Importer et exporter », cliquez sur « Exporter ».',
      'Google télécharge un fichier .zip : importez-le tel quel, chaque agenda est détecté.',
    ],
    subscribeHint: 'Pour une synchro continue : Paramètres de l’agenda → « Adresse secrète au format iCal ».',
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    formats: ['ics', 'csv'],
    steps: [
      'Outlook classique : Fichier → Ouvrir et exporter → Importer/Exporter → « Exporter vers un fichier » (CSV).',
      'Outlook.com / nouvel Outlook : Paramètres → Calendrier → Calendriers partagés → « Publier un calendrier ».',
      'Téléchargez le lien ICS publié, ou importez le CSV obtenu.',
    ],
    subscribeHint: 'Le lien ICS publié peut aussi être ajouté comme abonnement synchronisé.',
  },
  {
    id: 'apple',
    label: 'Apple Calendrier / iCloud',
    formats: ['ics'],
    steps: [
      'Sur Mac, ouvrez Calendrier et sélectionnez l’agenda dans la barre latérale.',
      'Fichier → Exporter → Exporter… pour obtenir un fichier .ics.',
      'Sur iCloud.com, partagez l’agenda en « Calendrier public » pour obtenir un lien webcal://.',
    ],
    subscribeHint: 'Les liens webcal:// d’iCloud sont acceptés comme abonnement.',
  },
  {
    id: 'proton',
    label: 'Proton Calendar',
    formats: ['ics'],
    steps: [
      'Ouvrez Proton Calendar → Paramètres → Calendriers.',
      'Choisissez l’agenda puis « Exporter » pour télécharger un fichier .ics.',
    ],
    subscribeHint: 'Un lien de partage public peut aussi être ajouté comme abonnement.',
  },
  {
    id: 'thunderbird',
    label: 'Thunderbird',
    formats: ['ics', 'csv'],
    steps: [
      'Dans Thunderbird, ouvrez l’onglet Agenda.',
      'Événements et tâches → Exporter… et choisissez le format iCalendar (.ics).',
    ],
  },
  {
    id: 'other',
    label: 'Autre application',
    formats: ['ics', 'csv', 'zip'],
    steps: [
      'Cherchez « Exporter » ou « Partager » dans les réglages de votre agenda.',
      'Les formats iCalendar (.ics, .ical, .vcs), CSV et ZIP sont acceptés.',
      'Vous pouvez aussi coller directement le contenu du fichier.',
    ],
  },
];

const PROVIDER_LABELS = Object.fromEntries([
  ...IMPORT_PROVIDERS.map(provider => [provider.id, provider.label]),
  ['caltemp', 'Caltemp'],
  ['fastmail', 'Fastmail'],
  ['nextcloud', 'Nextcloud'],
  ['yahoo', 'Yahoo Agenda'],
  ['zimbra', 'Zimbra'],
]);

export function getProviderLabel(id) {
  return PROVIDER_LABELS[id] || PROVIDER_LABELS.other;
}

const PRODID_RULES = [
  [/google/i, 'google'],
  [/microsoft|outlook|exchange/i, 'outlook'],
  [/apple|icloud|mac os x|ical\b/i, 'apple'],
  [/proton/i, 'proton'],
  [/mozilla|thunderbird|lightning/i, 'thunderbird'],
  [/fastmail/i, 'fastmail'],
  [/nextcloud|sabre/i, 'nextcloud'],
  [/yahoo/i, 'yahoo'],
  [/zimbra/i, 'zimbra'],
  [/caltemp/i, 'caltemp'],
];

function readIcsHeader(content, name) {
  const match = String(content || '').match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'mi'));
  return match ? match[1].trim().replace(/\\,/g, ',').replace(/\\;/g, ';') : '';
}

export function detectIcsProvider(content = '') {
  const prodId = readIcsHeader(content, 'PRODID');
  const rule = PRODID_RULES.find(([pattern]) => pattern.test(prodId));
  return rule ? rule[1] : 'other';
}

export function getIcsCalendarName(content = '') {
  return readIcsHeader(content, 'X-WR-CALNAME');
}

function getExtension(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

export function isSupportedImportFile(name = '') {
  return IMPORT_FILE_EXTENSIONS.includes(getExtension(name));
}

/** @returns {'ics' | 'csv' | 'zip' | 'unknown'} */
export function detectImportFormat(name = '', content = '') {
  const extension = getExtension(name);
  if (extension === 'zip') return 'zip';
  const text = typeof content === 'string' ? content.replace(/^﻿/, '').trimStart() : '';
  if (/^BEGIN:VCALENDAR/i.test(text)) return 'ics';
  if (['ics', 'ical', 'icalendar', 'ifb', 'vcs'].includes(extension)) return 'ics';
  if (extension === 'csv') return 'csv';
  if (text && /^[^\r\n]*[,;\t][^\r\n]*\r?\n/.test(text)) return 'csv';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function detectDelimiter(headerLine = '') {
  const counts = [',', ';', '\t'].map(delimiter => [delimiter, headerLine.split(delimiter).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}

/** RFC 4180 parser (quoted fields, escaped quotes, CRLF, multi-line cells). */
export function parseCsvRows(text = '', delimiter) {
  const source = String(text).replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const sep = delimiter || detectDelimiter(firstLine);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === sep) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(cells => cells.some(cell => cell.trim()));
}

function normalizeHeader(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CSV_COLUMNS = {
  title: ['subject', 'objet', 'titre', 'title', 'summary', 'sujet', 'nom', 'name', 'event', 'evenement'],
  startDate: ['start date', 'date de debut', 'debut', 'start', 'startdate', 'date debut', 'date', 'begin'],
  startTime: ['start time', 'heure de debut', 'heure debut', 'starttime'],
  endDate: ['end date', 'date de fin', 'fin', 'end', 'enddate'],
  endTime: ['end time', 'heure de fin', 'heure fin', 'endtime'],
  allDay: ['all day event', 'all day', 'journee entiere', 'toute la journee', 'jour entier', 'allday'],
  description: ['description', 'notes', 'note', 'body', 'corps', 'details'],
  location: ['location', 'lieu', 'emplacement', 'where', 'adresse'],
  categories: ['categories', 'category', 'categorie'],
  reminder: ['reminder on off', 'rappel actif inactif', 'rappel', 'reminder', 'alarme'],
};

function mapCsvColumns(header = []) {
  const normalized = header.map(normalizeHeader);
  const columns = {};
  for (const [field, aliases] of Object.entries(CSV_COLUMNS)) {
    const index = aliases.map(alias => normalized.indexOf(alias)).find(position => position >= 0);
    if (index !== undefined) columns[field] = index;
  }
  return columns;
}

function detectCsvProvider(header = []) {
  const normalized = header.map(normalizeHeader);
  if (normalized.includes('subject') && normalized.includes('start date') && normalized.includes('private')) return 'google';
  if (normalized.includes('meeting organizer') || normalized.includes('organisateur de la reunion')
    || normalized.includes('reminder on off') || normalized.includes('rappel actif inactif')) return 'outlook';
  return 'other';
}

const TRUE_VALUES = new Set(['true', 'vrai', 'oui', 'yes', '1', 'x', 'on', 'actif']);

function isTruthy(value = '') {
  return TRUE_VALUES.has(normalizeHeader(value));
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/;

/** Guesses whether slashed dates are day-first, from the values themselves. */
export function detectDateOrder(values = [], fallback = 'dmy') {
  for (const value of values) {
    const match = String(value || '').trim().match(SLASH_DATE);
    if (!match) continue;
    if (Number(match[1]) > 12) return 'dmy';
    if (Number(match[2]) > 12) return 'mdy';
  }
  return fallback;
}

function parseDatePart(value = '', order = 'dmy') {
  const text = String(value).trim();
  let year;
  let month;
  let day;
  let rest;
  const iso = text.match(ISO_DATE);
  if (iso) {
    [, year, month, day] = iso.map(Number);
    rest = text.slice(iso[0].length);
  } else {
    const slash = text.match(SLASH_DATE);
    if (!slash) return null;
    const [first, second, rawYear] = [Number(slash[1]), Number(slash[2]), Number(slash[3])];
    year = rawYear < 100 ? 2000 + rawYear : rawYear;
    // Dotted dates (16.06.2026) are always day-first.
    const dayFirst = order === 'dmy' || text[slash[1].length] === '.';
    day = dayFirst ? first : second;
    month = dayFirst ? second : first;
    rest = text.slice(slash[0].length);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, rest: rest.replace(/^[T\s,]+/, '') };
}

/** Accepts 14:30, 14h30, 9:00 AM, 09:00:00, 2 PM. */
export function parseTimePart(value = '') {
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  const match = text.match(/^(\d{1,2})(?:\s*[:h]\s*(\d{2}))?(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!match || (!match[2] && !match[4] && !text.includes('h'))) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[4]?.replace(/\./g, '');
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function toLocalDate({ year, month, day }, time) {
  return new Date(year, month - 1, day, time?.hour || 0, time?.minute || 0, 0, 0);
}

/**
 * Parses a CSV calendar export.
 * @returns {{ events: object[], provider: string, warnings: string[], dateOrder: string }}
 */
export function parseCalendarCsv(text = '', options = {}) {
  const rows = parseCsvRows(text);
  const warnings = [];
  if (rows.length < 2) return { events: [], provider: 'other', warnings: ['Le fichier CSV ne contient aucune ligne.'], dateOrder: 'dmy' };

  const [header, ...body] = rows;
  const columns = mapCsvColumns(header);
  const provider = detectCsvProvider(header);
  if (columns.title === undefined || columns.startDate === undefined) {
    return {
      events: [],
      provider,
      warnings: ['Colonnes « Objet/Subject » et « Date de début/Start Date » introuvables.'],
      dateOrder: 'dmy',
    };
  }

  const cell = (cells, field) => (columns[field] === undefined ? '' : (cells[columns[field]] || '').trim());
  const fallbackOrder = provider === 'google' && normalizeHeader(header[columns.startDate]) === 'start date' ? 'mdy' : 'dmy';
  const dateOrder = options.dateOrder || detectDateOrder(
    body.flatMap(cells => [cell(cells, 'startDate'), cell(cells, 'endDate')]),
    fallbackOrder,
  );

  const events = [];
  body.forEach((cells, rowIndex) => {
    const line = rowIndex + 2;
    const title = cell(cells, 'title');
    const startDate = parseDatePart(cell(cells, 'startDate'), dateOrder);
    if (!title || !startDate) {
      warnings.push(`Ligne ${line} ignorée : ${!title ? 'titre manquant' : 'date de début illisible'}.`);
      return;
    }
    const startTime = parseTimePart(cell(cells, 'startTime') || startDate.rest);
    const endDatePart = parseDatePart(cell(cells, 'endDate'), dateOrder);
    const endTime = parseTimePart(cell(cells, 'endTime') || endDatePart?.rest || '');
    const allDay = columns.allDay !== undefined ? isTruthy(cell(cells, 'allDay')) : !startTime;

    const start = toLocalDate(startDate, allDay ? null : startTime);
    let end = endDatePart ? toLocalDate(endDatePart, allDay ? null : (endTime || startTime)) : null;
    if (!endDatePart && endTime && !allDay) end = toLocalDate(startDate, endTime);
    // All-day CSV exports use an inclusive end date; iCalendar's is exclusive.
    if (allDay && end) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    if (end && end <= start) end = allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) : null;

    const durationMinutes = end ? Math.max(1, Math.round((end - start) / 60000)) : (allDay ? 1440 : 60);
    const categories = cell(cells, 'categories')
      .split(/[;,]/)
      .map(value => value.trim())
      .filter(Boolean);

    events.push({
      source: 'csv',
      title,
      description: cell(cells, 'description'),
      location: cell(cells, 'location'),
      date: start.toISOString(),
      endDate: end ? end.toISOString() : null,
      allDay,
      durationMinutes,
      sourceCategories: categories,
      ...(columns.reminder !== undefined && { sourceReminder: isTruthy(cell(cells, 'reminder')) }),
    });
  });

  return { events, provider, warnings, dateOrder };
}

// ---------------------------------------------------------------------------
// Duplicate analysis
// ---------------------------------------------------------------------------

function normalizeTitle(title = '') {
  return normalizeHeader(title).replace(/\s+/g, ' ');
}

function minuteStamp(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor(time / 60000) : 'nodate';
}

/** Identity used to spot the same event coming from two different exports. */
export function getEventFingerprint(event = {}) {
  return `${normalizeTitle(event.title)}|${minuteStamp(event.date)}`;
}

function getEventExternalKey(event = {}) {
  return event.externalId || event.uid || '';
}

function hasMeaningfulChanges(existing, incoming) {
  return ['title', 'description', 'location', 'endDate'].some(field => (existing[field] || '') !== (incoming[field] || ''))
    || minuteStamp(existing.date) !== minuteStamp(incoming.date)
    || (existing.recurrence || 'none') !== (incoming.recurrence || 'none');
}

function isPastEvent(event, now) {
  if (event.recurrence && event.recurrence !== 'none') return false;
  const end = new Date(event.endDate || event.date).getTime();
  return Number.isFinite(end) && end < now.getTime();
}

/**
 * Classifies every imported event against the calendar:
 * - `new`: not in Caltemp yet
 * - `update`: same UID already imported (outside a subscription), but its
 *   content changed
 * - `duplicate`: already present (same UID, or same title at the same minute),
 *   or repeated inside the batch itself
 */
export function analyzeImportEvents(importedEvents = [], existingEvents = [], { now = new Date() } = {}) {
  const byExternal = new Map();
  const byFingerprint = new Map();
  for (const event of existingEvents) {
    const external = getEventExternalKey(event);
    if (external) byExternal.set(external, event);
    byFingerprint.set(getEventFingerprint(event), event);
  }

  const seenExternal = new Set();
  const seenFingerprint = new Set();
  return importedEvents.map((event, index) => {
    const external = getEventExternalKey(event);
    const fingerprint = getEventFingerprint(event);
    const key = `${index}:${external || fingerprint}`;
    let status = 'new';
    let match = null;

    if ((external && seenExternal.has(external)) || seenFingerprint.has(fingerprint)) {
      status = 'duplicate';
    } else if (external && byExternal.has(external)) {
      match = byExternal.get(external);
      // Events owned by a live subscription are refreshed by the sync itself.
      status = !match.importSourceId && hasMeaningfulChanges(match, event) ? 'update' : 'duplicate';
    } else if (byFingerprint.has(fingerprint)) {
      match = byFingerprint.get(fingerprint);
      status = 'duplicate';
    }

    if (external) seenExternal.add(external);
    seenFingerprint.add(fingerprint);
    return {
      key,
      event,
      status,
      matchId: match?.id || null,
      isPast: isPastEvent(event, now),
    };
  });
}

export function summarizeImportItems(items = []) {
  return items.reduce((summary, item) => {
    summary.total += 1;
    summary[item.status] += 1;
    if (item.isPast) summary.past += 1;
    return summary;
  }, { total: 0, new: 0, update: 0, duplicate: 0, past: 0 });
}

/** Default selection for the review step. */
export function isItemSelectedByDefault(item, { skipDuplicates = true, skipPast = false, applyUpdates = true } = {}) {
  if (item.status === 'duplicate' && skipDuplicates) return false;
  if (item.status === 'update' && !applyUpdates) return false;
  if (item.isPast && skipPast) return false;
  return true;
}

const PRESERVED_ON_UPDATE = ['id', 'category', 'color', 'tags', 'reminder', 'todos', 'notifiedOccurrences', 'reminderSnoozes', 'geo'];

/**
 * Merges one-shot imports (files, pasted text) into the calendar.
 * Events whose UID already exists are refreshed in place (keeping the user's
 * category, reminder, todos...), the others are appended unless they are
 * exact duplicates (or `allowDuplicates` is set, when the user picked them).
 */
export function mergeImportedEvents(currentEvents = [], importedEvents = [], { allowDuplicates = false } = {}) {
  const events = [...currentEvents];
  const indexByExternal = new Map();
  const fingerprints = new Set();
  events.forEach((event, index) => {
    const external = getEventExternalKey(event);
    if (external) indexByExternal.set(external, index);
    fingerprints.add(getEventFingerprint(event));
  });

  const stats = { added: 0, updated: 0, skipped: 0 };
  for (const incoming of importedEvents) {
    const external = getEventExternalKey(incoming);
    if (external && indexByExternal.has(external)) {
      const index = indexByExternal.get(external);
      const existing = events[index];
      if (existing.importSourceId || !hasMeaningfulChanges(existing, incoming)) {
        stats.skipped += 1;
        continue;
      }
      const preserved = Object.fromEntries(PRESERVED_ON_UPDATE
        .filter(field => existing[field] !== undefined)
        .map(field => [field, existing[field]]));
      events[index] = { ...existing, ...incoming, ...preserved };
      fingerprints.add(getEventFingerprint(events[index]));
      stats.updated += 1;
      continue;
    }

    const fingerprint = getEventFingerprint(incoming);
    if (fingerprints.has(fingerprint) && !allowDuplicates) {
      stats.skipped += 1;
      continue;
    }
    fingerprints.add(fingerprint);
    if (external) indexByExternal.set(external, events.length);
    events.push(incoming);
    stats.added += 1;
  }
  return { events, stats };
}
