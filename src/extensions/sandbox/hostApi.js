import { getOccurrencesOnDate } from '../../domain/events.js';
import { EXTENSION_EVENTS } from '../constants.js';
import { assertPermission } from '../extensionPermissions.js';
import { cloneData } from './protocol.js';

const RESERVED_EVENT_PREFIXES = ['app:', 'calendar:', 'settings:', 'theme:', 'extension:', 'reminder:'];
const CUSTOM_EVENT_PATTERN = /^[a-z0-9][a-z0-9.-]*:[a-z0-9][a-z0-9:.-]*$/;
const NOTIFY_TYPES = new Set(['info', 'success', 'warning', 'error']);
const PANEL_BLOCK_LIMIT = 200;
const TEXT_LIMIT = 4000;
const MAX_OCCURRENCE_DAYS = 366;

// Settings a plugin can read with `settings:read`: display preferences only,
// never subscription URLs, routines, sound files or AI configuration.
const READABLE_SETTINGS = [
  'theme',
  'fontSize',
  'dateFormat',
  'notifications',
  'notificationMode',
  'categoryLegend',
  'calendarViews',
  'activeThemeId',
];

export function isCustomEventName(eventName) {
  return typeof eventName === 'string'
    && CUSTOM_EVENT_PATTERN.test(eventName)
    && !RESERVED_EVENT_PREFIXES.some((prefix) => eventName.startsWith(prefix));
}

export function isSubscribableEvent(eventName) {
  return EXTENSION_EVENTS.includes(eventName) || isCustomEventName(eventName);
}

export function pickReadableSettings(settings = {}) {
  const result = {};
  for (const key of READABLE_SETTINGS) {
    if (settings[key] !== undefined) result[key] = cloneData(settings[key]);
  }
  return result;
}

function text(value, limit = TEXT_LIMIT) {
  if (value === undefined || value === null) return '';
  return String(value).slice(0, limit);
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export function hostMatches(hostname, allowedHosts = []) {
  const host = String(hostname || '').toLowerCase();
  return allowedHosts.some((allowed) => (
    allowed.startsWith('*.')
      ? host.endsWith(allowed.slice(1)) && host.length > allowed.length - 1
      : host === allowed
  ));
}

function sanitizeBlock(block) {
  if (!block || typeof block !== 'object') return null;
  switch (block.type) {
    case 'heading':
    case 'text':
      return { type: block.type, text: text(block.text) };
    case 'divider':
      return { type: 'divider' };
    case 'image': {
      const url = httpsUrl(block.url);
      return url ? { type: 'image', url, alt: text(block.alt, 300) } : null;
    }
    case 'list':
      return {
        type: 'list',
        items: (Array.isArray(block.items) ? block.items : []).slice(0, PANEL_BLOCK_LIMIT).map((item) => ({
          title: text(item?.title, 300),
          subtitle: text(item?.subtitle, 500),
          meta: text(item?.meta, 120),
          color: /^#[0-9a-f]{3,8}$/i.test(item?.color || '') ? item.color : '',
          onClick: typeof item?.onClick === 'function' ? item.onClick : null,
        })),
      };
    case 'stats':
      return {
        type: 'stats',
        items: (Array.isArray(block.items) ? block.items : []).slice(0, 24).map((item) => ({
          label: text(item?.label, 120),
          value: text(item?.value, 120),
        })),
      };
    case 'progress': {
      const value = Number(block.value);
      return {
        type: 'progress',
        label: text(block.label, 200),
        value: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0,
      };
    }
    case 'actions':
      return {
        type: 'actions',
        items: (Array.isArray(block.items) ? block.items : []).slice(0, 12)
          .filter((item) => typeof item?.onClick === 'function')
          .map((item) => ({
            label: text(item.label, 80) || 'Action',
            variant: item.variant === 'primary' || item.variant === 'danger' ? item.variant : 'default',
            onClick: item.onClick,
          })),
      };
    default:
      return null;
  }
}

export function sanitizePanel(panel, manifest) {
  if (!panel || typeof panel !== 'object') throw new Error('ui.showPanel attend un objet.');
  return {
    extensionId: manifest.id,
    extensionName: manifest.name,
    title: text(panel.title, 200) || manifest.name,
    description: text(panel.description, 1000),
    blocks: (Array.isArray(panel.blocks) ? panel.blocks : [])
      .slice(0, PANEL_BLOCK_LIMIT)
      .map(sanitizeBlock)
      .filter(Boolean),
  };
}

function filterByRange(events, range) {
  if (!range || (range.from === undefined && range.to === undefined)) return events;
  const from = range.from !== undefined ? new Date(range.from).getTime() : -Infinity;
  const to = range.to !== undefined ? new Date(range.to).getTime() : Infinity;
  return events.filter((event) => {
    const time = new Date(event.date).getTime();
    return Number.isFinite(time) && time >= from && time <= to;
  });
}

// Expands recurring events into the occurrences of each day in [from, to].
function listOccurrences(events, range = {}) {
  const from = new Date(range.from ?? Date.now());
  const to = new Date(range.to ?? from.getTime() + 7 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('calendar.occurrences: dates from/to invalides.');
  }
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const result = [];
  for (let count = 0; day <= to && count < MAX_OCCURRENCE_DAYS; count += 1) {
    for (const occurrence of getOccurrencesOnDate(events, day)) {
      const time = new Date(occurrence.date).getTime();
      if (time >= from.getTime() && time <= to.getTime()) result.push(occurrence);
    }
    day.setDate(day.getDate() + 1);
  }
  return result.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * The capabilities one plugin can request. Every method runs in the app
 * window, so each one validates its input and checks the manifest itself:
 * the sandbox only forwards requests.
 *
 * Registrations (commands, panels, subscriptions) are tracked here and
 * released by `dispose()`, so plugins never need to clean up after
 * themselves.
 */
export function createPluginApi({ manifest, host = {}, storage, config, emitCustomEvent }) {
  const permissions = manifest.permissions || [];
  const require = (permission) => assertPermission(permissions, permission, manifest.id);
  const commandDisposers = new Map();
  const panels = new Map();
  const subscriptions = new Set();
  let nextPanelId = 1;

  const requireHost = (name) => {
    if (typeof host[name] !== 'function') throw new Error(`${name} indisponible.`);
    return host[name];
  };

  const getEvents = () => (host.getEvents ? host.getEvents() : []) || [];

  const methods = {
    'events.subscribe': (eventName) => {
      if (!isSubscribableEvent(eventName)) throw new Error(`Événement inconnu: ${eventName}`);
      subscriptions.add(eventName);
    },
    'events.unsubscribe': (eventName) => {
      subscriptions.delete(eventName);
    },
    'events.emit': (eventName, payload) => {
      if (!isCustomEventName(eventName)) {
        throw new Error(`Seuls les événements personnalisés (ex. "mon-plugin:fini") peuvent être émis: ${eventName}`);
      }
      emitCustomEvent?.(eventName, cloneData(payload));
    },

    'calendar.list': (range) => {
      require('calendar:read');
      return cloneData(filterByRange(getEvents(), range));
    },
    'calendar.occurrences': (range) => {
      require('calendar:read');
      return cloneData(listOccurrences(getEvents(), range));
    },
    'calendar.get': (eventId) => {
      require('calendar:read');
      return cloneData(getEvents().find((event) => event.id === eventId) || null);
    },
    'calendar.create': async (event) => {
      require('calendar:write');
      if (!event || typeof event !== 'object') throw new Error('calendar.create attend un événement.');
      return cloneData(await requireHost('createEvent')(cloneData(event)));
    },
    'calendar.update': async (event) => {
      require('calendar:write');
      if (!event?.id || !getEvents().some((item) => item.id === event.id)) {
        throw new Error('calendar.update: événement introuvable.');
      }
      return cloneData(await requireHost('updateEvent')(cloneData(event)));
    },
    'calendar.delete': async (eventId) => {
      require('calendar:write');
      if (!getEvents().some((item) => item.id === eventId)) {
        throw new Error('calendar.delete: événement introuvable.');
      }
      await requireHost('deleteEvent')(eventId);
    },

    'settings.read': () => {
      require('settings:read');
      return pickReadableSettings(host.getSettings ? host.getSettings() : {});
    },

    'notifications.send': async (title, body, type) => {
      require('notifications:send');
      await requireHost('notify')(text(title, 200), text(body, 1000), NOTIFY_TYPES.has(type) ? type : 'info');
    },
    'ui.toast': (message, type) => {
      const toast = host.toast || host.notify;
      if (typeof toast !== 'function') throw new Error('ui.toast indisponible.');
      return toast(manifest.name, text(message, 1000), NOTIFY_TYPES.has(type) ? type : 'info');
    },

    'commands.register': (command) => {
      if (!command || typeof command.id !== 'string' || !command.id.trim()
        || typeof command.label !== 'string' || typeof command.run !== 'function') {
        throw new Error('Une commande doit définir id, label et run().');
      }
      commandDisposers.get(command.id)?.();
      const dispose = requireHost('registerAction')({
        id: `${manifest.id}:${command.id}`,
        label: text(command.label, 200),
        extensionId: manifest.id,
        extensionName: manifest.name,
        run: command.run,
      });
      commandDisposers.set(command.id, typeof dispose === 'function' ? dispose : () => {});
    },
    'commands.unregister': (commandId) => {
      commandDisposers.get(commandId)?.();
      commandDisposers.delete(commandId);
    },

    'ui.openGallery': (gallery) => {
      requireHost('openGallery')(cloneData(gallery));
    },
    'ui.showPanel': (panel) => {
      const panelId = `${manifest.id}#${nextPanelId}`;
      nextPanelId += 1;
      const handle = requireHost('showPanel')({
        id: panelId,
        ...sanitizePanel(panel, manifest),
        // Called by the host when the user closes the panel.
        onClose: () => panels.delete(panelId),
      });
      panels.set(panelId, handle || {});
      return panelId;
    },
    'ui.updatePanel': (panelId, panel) => {
      const handle = panels.get(panelId);
      if (!handle) throw new Error('Panneau fermé.');
      handle.update?.({ id: panelId, ...sanitizePanel(panel, manifest), onClose: () => panels.delete(panelId) });
    },
    'ui.closePanel': (panelId) => {
      panels.get(panelId)?.close?.();
      panels.delete(panelId);
    },

    'config.set': (values) => config.set(values),

    'storage.get': (key) => storage.get(key),
    'storage.set': (key, value) => storage.set(key, value),
    'storage.remove': (key) => storage.remove(key),
    'storage.keys': () => storage.keys(),
    'storage.clear': () => storage.clear(),

    'http.fetch': async (url, init = {}) => {
      require('network');
      let target;
      try {
        target = new URL(String(url));
      } catch {
        throw new Error(`URL invalide: ${url}`);
      }
      if (target.protocol !== 'https:') throw new Error('http.fetch n’accepte que des URLs HTTPS.');
      if (!hostMatches(target.hostname, manifest.hosts)) {
        throw new Error(`Domaine non déclaré dans hosts: ${target.hostname}`);
      }
      const response = await requireHost('fetch')(target.href, {
        method: typeof init.method === 'string' ? init.method.toUpperCase() : 'GET',
        headers: cloneData(init.headers) || {},
        body: typeof init.body === 'string' ? init.body : undefined,
      });
      const body = await response.text();
      const headers = {};
      response.headers?.forEach?.((value, key) => {
        headers[key] = value;
      });
      return { ok: response.ok, status: response.status, headers, body };
    },
  };

  return {
    methods,
    isSubscribed: (eventName) => subscriptions.has(eventName),
    hasPermission: (permission) => permissions.includes(permission),
    dispose: () => {
      for (const dispose of commandDisposers.values()) dispose();
      commandDisposers.clear();
      for (const handle of panels.values()) handle.close?.();
      panels.clear();
      subscriptions.clear();
    },
  };
}
