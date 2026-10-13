export const CALTEMP_SDK_VERSION = '2.0.0';
export const CALTEMP_MIN_COMPAT_VERSION = '6.0.0';

export const DEFAULT_EXTENSION_REGISTRY_URL =
  'https://raw.githubusercontent.com/darkiifr/Caltemp/main/extensions/registry.json';

export const EXTENSION_PERMISSIONS = Object.freeze([
  'calendar:read',
  'calendar:write',
  'settings:read',
  'notifications:send',
  'network',
]);

// Accepted in manifests for SDK 1.x compatibility. `storage:extension` is now
// implicit (every plugin has private storage) and `network:github` was never
// wired to anything.
export const LEGACY_PERMISSIONS = Object.freeze(['storage:extension', 'network:github']);

export const PERMISSION_LABELS = Object.freeze({
  'calendar:read': 'Lire vos événements',
  'calendar:write': 'Créer, modifier et supprimer des événements',
  'settings:read': 'Lire les réglages d’affichage',
  'notifications:send': 'Envoyer des notifications',
  network: 'Accéder à Internet (domaines déclarés)',
});

export const EXTENSION_EVENTS = Object.freeze([
  'app:ready',
  'calendar:event-created',
  'calendar:event-updated',
  'calendar:event-deleted',
  'reminder:triggered',
  'settings:changed',
  'theme:changed',
  'extension:installed',
  'extension:updated',
  'extension:removed',
  'extension:enabled',
  'extension:disabled',
]);

// Event payloads that carry calendar data are only delivered in full to
// plugins holding `calendar:read`; the others receive `{ eventId }`.
export const CALENDAR_EVENTS = Object.freeze([
  'calendar:event-created',
  'calendar:event-updated',
  'calendar:event-deleted',
  'reminder:triggered',
]);

export const PLUGIN_ACTIVATION_TIMEOUT_MS = 10000;
export const PLUGIN_STORAGE_MAX_BYTES = 1024 * 1024;
