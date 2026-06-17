export const CALTEMP_SDK_VERSION = '1.1.0';
export const CALTEMP_MIN_COMPAT_VERSION = '6.0.0';

export const DEFAULT_EXTENSION_REGISTRY_URL =
  'https://raw.githubusercontent.com/darkiifr/Caltemp/main/extensions/registry.json';

export const EXTENSION_PERMISSIONS = Object.freeze([
  'calendar:read',
  'calendar:write',
  'settings:read',
  'notifications:send',
  'network:github',
  'storage:extension',
]);

export const EXTENSION_EVENTS = Object.freeze([
  'app:ready',
  'calendar:event-created',
  'calendar:event-updated',
  'calendar:event-deleted',
  'settings:changed',
  'theme:changed',
  'extension:installed',
  'extension:updated',
  'extension:removed',
  'extension:enabled',
  'extension:disabled',
]);
