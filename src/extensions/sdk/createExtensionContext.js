import { CALTEMP_SDK_VERSION } from '../constants.js';
import { assertPermission } from '../extensionPermissions.js';

export function createExtensionContext({
  manifest,
  eventBus,
  host = {},
  storage,
  logger = console,
}) {
  const permissions = manifest.permissions || [];
  const extensionId = manifest.id;

  const requirePermission = (permission) => {
    assertPermission(permissions, permission, extensionId);
  };

  return Object.freeze({
    sdkVersion: CALTEMP_SDK_VERSION,
    manifest,
    events: {
      on: (eventName, handler) => eventBus.on(eventName, handler),
      emit: (eventName, payload) => eventBus.emit(eventName, payload),
    },
    calendar: {
      listEvents: () => {
        requirePermission('calendar:read');
        return host.getEvents ? host.getEvents() : [];
      },
      createEvent: async (event) => {
        requirePermission('calendar:write');
        if (!host.createEvent) throw new Error('calendar.createEvent indisponible.');
        return host.createEvent(event);
      },
      updateEvent: async (event) => {
        requirePermission('calendar:write');
        if (!host.updateEvent) throw new Error('calendar.updateEvent indisponible.');
        return host.updateEvent(event);
      },
      deleteEvent: async (eventId) => {
        requirePermission('calendar:write');
        if (!host.deleteEvent) throw new Error('calendar.deleteEvent indisponible.');
        return host.deleteEvent(eventId);
      },
    },
    settings: {
      read: () => {
        requirePermission('settings:read');
        return host.getSettings ? host.getSettings() : {};
      },
    },
    notifications: {
      send: async (title, body, type = 'info') => {
        requirePermission('notifications:send');
        if (!host.notify) throw new Error('notifications.send indisponible.');
        return host.notify(title, body, type);
      },
    },
    storage: {
      get: async (key) => {
        requirePermission('storage:extension');
        return storage.get(extensionId, key);
      },
      set: async (key, value) => {
        requirePermission('storage:extension');
        return storage.set(extensionId, key, value);
      },
      remove: async (key) => {
        requirePermission('storage:extension');
        return storage.remove(extensionId, key);
      },
    },
    ui: {
      registerAction: host.registerAction || (() => {}),
    },
    logger: {
      debug: (...args) => logger.debug?.(`[${extensionId}]`, ...args),
      info: (...args) => logger.info?.(`[${extensionId}]`, ...args),
      warn: (...args) => logger.warn?.(`[${extensionId}]`, ...args),
      error: (...args) => logger.error?.(`[${extensionId}]`, ...args),
    },
  });
}
