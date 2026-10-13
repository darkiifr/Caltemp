// Message protocol between the host (app window) and a sandboxed plugin.
//
// host -> guest: load, result, invoke, event, config, deactivate
// guest -> host: loaded, load-error, call, invoke-result, log, deactivated
//
// Functions cannot cross a postMessage boundary, so callbacks passed by a
// plugin (a command's `run`, a panel button's `onClick`) are replaced by
// `{ [CALLBACK_KEY]: id }` and invoked back with an `invoke` message.

export const CALLBACK_KEY = '__caltempCallback';

export function isCallbackRef(value) {
  return Boolean(value && typeof value === 'object' && typeof value[CALLBACK_KEY] === 'number');
}

export function serializeError(error) {
  if (error instanceof Error) return { message: error.message, name: error.name };
  return { message: String(error ?? 'Erreur inconnue') };
}

export function deserializeError(error) {
  const result = new Error(error?.message || 'Erreur inconnue');
  if (error?.name) result.name = error.name;
  return result;
}

/**
 * Deep-maps plain data, replacing values for which `replace` returns
 * something other than `undefined`. Class instances other than Date are
 * dropped so only structured-clone-safe data crosses the boundary.
 */
export function mapData(value, replace, depth = 0) {
  if (depth > 32) return undefined;
  const replaced = replace(value);
  if (replaced !== undefined) return replaced;
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' || typeof value === 'symbol' ? undefined : value;
  }
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map((item) => mapData(item, replace, depth + 1));
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const mapped = mapData(item, replace, depth + 1);
    if (mapped !== undefined) result[key] = mapped;
  }
  return result;
}

export function cloneData(value) {
  return mapData(value, () => undefined);
}
