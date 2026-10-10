// Tools Dexter's local model can call (OpenAI "tools" format, understood by
// llama-server). Executors are pure apart from the `host` they receive, which
// App.jsx provides: every write goes through the app's usual flows.
import { buildOccurrenceIndex, normalizeEvent, toDayKey } from './events';
import { buildWeeklySummary } from './planning';
import { suggestTimeSlots } from './smartScheduling';

export const DEXTER_VIEWS = ['year', 'month', 'week', 'day', 'agenda', 'focus', 'stats', 'map'];
export const DEXTER_PANELS = ['settings', 'reminders', 'import', 'subscriptions', 'command_palette', 'new_event'];
export const DEXTER_SETTINGS_TABS = ['general', 'appearance', 'background', 'sounds', 'productivity', 'extensions', 'ai', 'about'];
const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const MAX_LISTED_EVENTS = 25;
const MAX_RANGE_DAYS = 366;

// Settings the assistant may change. Everything else stays in the Settings panel.
const SETTING_RULES = {
  notificationMode: value => (['normal', 'silent'].includes(value) ? value : undefined),
  notifications: value => (typeof value === 'boolean' ? value : undefined),
  showHolidays: value => (typeof value === 'boolean' ? value : undefined),
  showNamedays: value => (typeof value === 'boolean' ? value : undefined),
  mapAutoGeocode: value => (typeof value === 'boolean' ? value : undefined),
  discordRpcEnabled: value => (typeof value === 'boolean' ? value : undefined),
  fontSize: value => {
    const size = Math.round(Number(value));
    return size >= 12 && size <= 22 ? size : undefined;
  },
};

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: { type: 'object', properties, required },
  },
});

const DATE_HINT = 'Date locale ISO 8601, ex. 2026-10-12T14:30';

export const DEXTER_TOOLS = [
  fn('list_events', 'Liste les événements de l’agenda entre deux dates (par défaut les 14 prochains jours).', {
    from: { type: 'string', description: DATE_HINT },
    to: { type: 'string', description: DATE_HINT },
    query: { type: 'string', description: 'Mot du titre, de la description ou du lieu' },
    category: { type: 'string', description: 'Clé de catégorie' },
  }),
  fn('create_event', 'Crée un événement.', {
    title: { type: 'string' },
    date: { type: 'string', description: DATE_HINT },
    durationMinutes: { type: 'integer' },
    category: { type: 'string', description: 'Clé de catégorie' },
    reminder: { type: 'boolean', description: 'Alerte au moment de l’événement' },
    recurrence: { type: 'string', enum: RECURRENCES },
    location: { type: 'string' },
    description: { type: 'string' },
  }, ['title', 'date']),
  fn('update_event', 'Modifie un événement existant (seuls les champs fournis changent).', {
    id: { type: 'string', description: 'id renvoyé par list_events' },
    title: { type: 'string' },
    date: { type: 'string', description: DATE_HINT },
    durationMinutes: { type: 'integer' },
    category: { type: 'string' },
    reminder: { type: 'boolean' },
    recurrence: { type: 'string', enum: RECURRENCES },
    location: { type: 'string' },
    description: { type: 'string' },
  }, ['id']),
  fn('delete_event', 'Supprime un événement. L’utilisateur devra confirmer.', {
    id: { type: 'string', description: 'id renvoyé par list_events' },
  }, ['id']),
  fn('find_free_slots', 'Propose des créneaux libres pour un jour donné.', {
    date: { type: 'string', description: 'Jour, ex. 2026-10-12' },
    durationMinutes: { type: 'integer' },
    title: { type: 'string' },
    category: { type: 'string' },
  }, ['date']),
  fn('week_summary', 'Résume une semaine (nombre d’événements par catégorie).', {
    date: { type: 'string', description: 'Un jour de la semaine voulue' },
  }),
  fn('show_calendar', 'Affiche l’agenda dans une vue et à une date.', {
    view: { type: 'string', enum: DEXTER_VIEWS },
    date: { type: 'string', description: DATE_HINT },
  }, ['view']),
  fn('open_panel', 'Ouvre un écran de Caltemp.', {
    panel: { type: 'string', enum: DEXTER_PANELS },
    tab: { type: 'string', enum: DEXTER_SETTINGS_TABS, description: 'Onglet, pour panel=settings' },
    date: { type: 'string', description: 'Pour panel=new_event' },
  }, ['panel']),
  fn('update_settings', 'Change un réglage simple de Caltemp.', {
    notificationMode: { type: 'string', enum: ['normal', 'silent'] },
    notifications: { type: 'boolean' },
    showHolidays: { type: 'boolean' },
    showNamedays: { type: 'boolean' },
    mapAutoGeocode: { type: 'boolean' },
    discordRpcEnabled: { type: 'boolean' },
    fontSize: { type: 'integer', description: '12 à 22' },
  }),
  fn('export_view', 'Exporte la vue de l’agenda en image ou PDF.', {
    format: { type: 'string', enum: ['png', 'pdf'] },
  }, ['format']),
  fn('sync_subscriptions', 'Actualise les agendas abonnés (liens ICS).'),
  fn('search_web', 'Recherche une information actuelle sur le web.', {
    query: { type: 'string' },
  }, ['query']),
];

export const DEXTER_TOOL_NAMES = new Set(DEXTER_TOOLS.map(tool => tool.function.name));

/**
 * Parses a date written by the model. Date-only values are local days (not
 * UTC midnight, which `new Date('2026-10-12')` would give).
 */
export function parseToolDate(value, { defaultHour = 9 } = {}) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), defaultHour, 0, 0, 0);
  }
  const parsed = new Date(text.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const startOfLocalDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

function pad(value) {
  return String(value).padStart(2, '0');
}

/** Local ISO without timezone: what the model reads and writes back. */
export function toLocalIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeText(value = '') {
  return String(value)
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function compactEvent(event, settings = {}) {
  const date = new Date(event.date);
  const label = settings.categoryLegend?.[event.category]?.label;
  const item = {
    id: event.id,
    title: event.title,
    date: toLocalIso(date),
    durationMinutes: event.durationMinutes,
    category: label ? `${event.category} (${label})` : event.category,
  };
  if (event.allDay) item.allDay = true;
  if (event.reminder) item.reminder = true;
  if (event.recurrence && event.recurrence !== 'none') item.recurrence = event.recurrence;
  if (event.location) item.location = event.location;
  return item;
}

export function listEventOccurrences(events = [], { from, to, query, category, now = new Date(), settings = {} } = {}) {
  const start = startOfLocalDay(parseToolDate(from, { defaultHour: 0 }) || now);
  let end = parseToolDate(to, { defaultHour: 0 });
  end = end ? startOfLocalDay(end) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 13);
  if (end < start) end = new Date(start);
  const maxEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + MAX_RANGE_DAYS);
  if (end > maxEnd) end = maxEnd;

  const index = buildOccurrenceIndex(events, start, end);
  const terms = normalizeText(query || '').split(/\s+/).filter(term => term.length >= 2);
  const wantedCategory = category ? normalizeText(category) : '';
  const occurrences = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    for (const occurrence of index.get(toDayKey(cursor)) || []) {
      if (wantedCategory && normalizeText(occurrence.category) !== wantedCategory) continue;
      if (terms.length) {
        const haystack = normalizeText([occurrence.title, occurrence.description, occurrence.location].join(' '));
        if (!terms.every(term => haystack.includes(term))) continue;
      }
      occurrences.push(occurrence);
    }
  }

  return {
    from: toLocalIso(start).slice(0, 10),
    to: toLocalIso(end).slice(0, 10),
    total: occurrences.length,
    events: occurrences.slice(0, MAX_LISTED_EVENTS).map(event => compactEvent(event, settings)),
    truncated: occurrences.length > MAX_LISTED_EVENTS,
  };
}

function resolveCategory(value, settings = {}) {
  if (!value) return undefined;
  const legend = settings.categoryLegend || {};
  const wanted = normalizeText(value).replace(/\s*\(.*\)$/, '');
  const match = Object.entries(legend).find(([key, meta]) => (
    normalizeText(key) === wanted || normalizeText(meta?.label || '') === wanted
  ));
  return match ? match[0] : undefined;
}

/** Turns tool arguments into event fields, ignoring anything invalid. */
export function eventFieldsFromArgs(args = {}, settings = {}) {
  const fields = {};
  const errors = [];
  if (args.title !== undefined) {
    const title = String(args.title).trim();
    if (title) fields.title = title.slice(0, 200);
    else errors.push('titre vide');
  }
  if (args.date !== undefined) {
    const date = parseToolDate(args.date);
    if (date) fields.date = date.toISOString();
    else errors.push(`date invalide « ${args.date} »`);
  }
  if (args.durationMinutes !== undefined) {
    const minutes = Math.round(Number(args.durationMinutes));
    if (minutes > 0 && minutes <= 24 * 60 * 14) fields.durationMinutes = minutes;
  }
  const category = resolveCategory(args.category, settings);
  if (category) fields.category = category;
  if (typeof args.reminder === 'boolean') fields.reminder = args.reminder;
  if (RECURRENCES.includes(args.recurrence)) fields.recurrence = args.recurrence;
  if (typeof args.location === 'string') fields.location = args.location.slice(0, 300);
  if (typeof args.description === 'string') fields.description = args.description.slice(0, 4000);
  return { fields, errors };
}

export function filterSettingsPatch(args = {}) {
  const patch = {};
  for (const [key, rule] of Object.entries(SETTING_RULES)) {
    if (args[key] === undefined) continue;
    const value = rule(args[key]);
    if (value !== undefined) patch[key] = value;
  }
  return patch;
}

function formatWhen(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function eventCard(event, settings, heading) {
  const category = settings.categoryLegend?.[event.category]?.label || event.category || 'Sans catégorie';
  return `${heading}\n\n**${event.title}** · ${formatWhen(event.date)}\n${category} · alerte ${event.reminder ? 'activée' : 'désactivée'}`;
}

function findEvent(events, id) {
  const wanted = String(id || '').trim();
  if (!wanted) return null;
  // Occurrence keys (`id:timestamp`) point to their series.
  const baseId = wanted.includes(':') ? wanted.split(':')[0] : wanted;
  return events.find(event => event.id === wanted) || events.find(event => event.id === baseId) || null;
}

const PANEL_LABELS = {
  settings: 'les paramètres',
  reminders: 'la liste des événements',
  import: 'l’assistant d’import',
  subscriptions: 'les abonnements ICS',
  command_palette: 'la palette de commandes',
  new_event: 'un nouvel événement',
};

const fail = message => ({ ok: false, result: { error: message } });

/**
 * Runs one tool call.
 * Returns `{ ok, result, display?, confirmation?, closesDexter? }`:
 * - `result` goes back to the model (keep it small);
 * - `display` is a markdown line shown in the chat;
 * - `confirmation` is an action the user must approve in the chat first.
 */
export async function executeDexterTool(name, rawArgs, host) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const settings = host.getSettings?.() || {};
  const now = host.now?.() || new Date();

  switch (name) {
    case 'list_events': {
      const result = listEventOccurrences(host.getEvents(), { ...args, now, settings });
      return { ok: true, result };
    }

    case 'create_event': {
      const { fields, errors } = eventFieldsFromArgs(args, settings);
      if (!fields.title || !fields.date) {
        return fail(`Impossible de créer l’événement : ${errors.join(', ') || 'titre et date requis'}.`);
      }
      const event = normalizeEvent({ reminder: true, ...fields, id: host.createId?.() || `${Date.now()}` }, settings);
      await host.saveEvent(event);
      return {
        ok: true,
        result: { created: compactEvent(event, settings) },
        display: eventCard(event, settings, '✅ **Événement créé**'),
      };
    }

    case 'update_event': {
      const existing = findEvent(host.getEvents(), args.id);
      if (!existing) return fail('Aucun événement avec cet id. Utilise list_events pour le retrouver.');
      const { fields, errors } = eventFieldsFromArgs(args, settings);
      if (!Object.keys(fields).length) {
        return fail(`Rien à modifier${errors.length ? ` : ${errors.join(', ')}` : ''}.`);
      }
      const event = { ...existing, ...fields, id: existing.id };
      await host.saveEvent(event);
      return {
        ok: true,
        result: { updated: compactEvent(normalizeEvent(event, settings), settings) },
        display: eventCard(normalizeEvent(event, settings), settings, '✏️ **Événement modifié**'),
      };
    }

    case 'delete_event': {
      const existing = findEvent(host.getEvents(), args.id);
      if (!existing) return fail('Aucun événement avec cet id. Utilise list_events pour le retrouver.');
      return {
        ok: true,
        result: { status: 'En attente de confirmation par l’utilisateur dans la discussion.' },
        confirmation: {
          kind: 'delete_event',
          eventId: existing.id,
          label: `Supprimer « ${existing.title} » (${formatWhen(existing.date)}) ?`,
          confirmLabel: 'Supprimer',
        },
      };
    }

    case 'find_free_slots': {
      const date = parseToolDate(args.date, { defaultHour: 12 });
      if (!date) return fail('Date invalide.');
      const slots = suggestTimeSlots(host.getEvents(), {
        date,
        durationMinutes: Number(args.durationMinutes) || 60,
        category: resolveCategory(args.category, settings),
        title: args.title,
        now,
      });
      return {
        ok: true,
        result: {
          date: toLocalIso(date).slice(0, 10),
          slots: slots.map(slot => ({
            start: slot.time,
            end: slot.endTime,
            reasons: slot.reasons,
          })),
        },
      };
    }

    case 'week_summary': {
      const date = parseToolDate(args.date, { defaultHour: 12 }) || now;
      const summary = buildWeeklySummary(host.getEvents(), date);
      return {
        ok: true,
        result: {
          from: toLocalIso(summary.start).slice(0, 10),
          to: toLocalIso(summary.end).slice(0, 10),
          total: summary.total,
          byCategory: summary.byCategory,
          events: summary.events.slice(0, MAX_LISTED_EVENTS).map(event => compactEvent(event, settings)),
        },
      };
    }

    case 'show_calendar': {
      if (!DEXTER_VIEWS.includes(args.view)) return fail(`Vue inconnue. Choix : ${DEXTER_VIEWS.join(', ')}.`);
      const date = parseToolDate(args.date) || now;
      host.navigate({ view: args.view, date });
      return { ok: true, result: { shown: args.view, date: toLocalIso(date).slice(0, 10) }, closesDexter: true };
    }

    case 'open_panel': {
      if (!DEXTER_PANELS.includes(args.panel)) return fail(`Écran inconnu. Choix : ${DEXTER_PANELS.join(', ')}.`);
      const tab = DEXTER_SETTINGS_TABS.includes(args.tab) ? args.tab : undefined;
      host.openPanel(args.panel, { tab, date: parseToolDate(args.date) || undefined });
      return {
        ok: true,
        result: { opened: args.panel },
        display: `↗️ J’ouvre ${PANEL_LABELS[args.panel]}.`,
      };
    }

    case 'update_settings': {
      const patch = filterSettingsPatch(args);
      if (!Object.keys(patch).length) return fail('Aucun réglage modifiable reconnu.');
      await host.patchSettings(patch);
      return {
        ok: true,
        result: { updated: patch },
        display: `⚙️ Réglages mis à jour : ${Object.keys(patch).join(', ')}.`,
      };
    }

    case 'export_view': {
      if (!['png', 'pdf'].includes(args.format)) return fail('Format attendu : png ou pdf.');
      await host.exportView(args.format);
      return { ok: true, result: { exported: args.format }, display: `📄 Vue exportée en ${args.format.toUpperCase()}.` };
    }

    case 'sync_subscriptions': {
      const outcomes = (await host.syncSubscriptions?.()) || [];
      const failed = outcomes.filter(outcome => outcome?.status === 'error').length;
      return {
        ok: true,
        result: { refreshed: outcomes.length, failed },
        display: outcomes.length
          ? `🔄 ${outcomes.length} abonnement(s) actualisé(s)${failed ? `, ${failed} en erreur` : ''}.`
          : '🔄 Aucun abonnement ICS à actualiser.',
      };
    }

    case 'search_web': {
      const query = String(args.query || '').trim();
      if (!query) return fail('Requête vide.');
      const results = (await host.searchWeb?.(query)) || [];
      return {
        ok: true,
        result: {
          query,
          results: results.slice(0, 5).map(item => ({ title: item.title, snippet: String(item.snippet || '').slice(0, 400) })),
        },
      };
    }

    default:
      return fail(`Outil inconnu : ${name}.`);
  }
}
