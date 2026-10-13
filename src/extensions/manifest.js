import { CALTEMP_MIN_COMPAT_VERSION, CALTEMP_SDK_VERSION } from './constants.js';
import { normalizePermissions } from './extensionPermissions.js';

const MANIFEST_TYPES = ['plugin', 'theme'];
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9.-]+[a-z0-9]$/;
const HOST_PATTERN = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const COLOR_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
const SETTING_TYPES = ['boolean', 'string', 'number', 'select'];
const DEFAULT_ENTRY = 'index.js';

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Le champ ${field} est obligatoire.`);
  }
  return value.trim();
}

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateVersion(version, field) {
  const normalized = requireString(version, field);
  if (!SEMVER_PATTERN.test(normalized)) {
    throw new Error(`Le champ ${field} doit être une version semver.`);
  }
  return normalized;
}

// `theme.colors: { accent: '#f00' }` is shorthand for
// `theme.variables: { '--caltemp-accent': '#f00' }`; both can be combined.
function validateTheme(theme) {
  if (!theme || typeof theme !== 'object') {
    throw new Error('Un manifeste de thème doit définir theme.variables ou theme.colors.');
  }

  const { variables = {}, colors = {} } = theme;
  if (typeof variables !== 'object' || Array.isArray(variables)
    || typeof colors !== 'object' || Array.isArray(colors)) {
    throw new Error('Un manifeste de thème doit définir theme.variables ou theme.colors.');
  }

  const normalizedVariables = {};
  for (const [key, value] of Object.entries(colors)) {
    if (!COLOR_KEY_PATTERN.test(key) || typeof value !== 'string' || !value.trim()) {
      throw new Error(`Couleur de thème invalide: ${key}`);
    }
    normalizedVariables[`--caltemp-${key}`] = value.trim();
  }
  for (const [key, value] of Object.entries(variables)) {
    if (!key.startsWith('--') || typeof value !== 'string' || !value.trim()) {
      throw new Error(`Variable de thème invalide: ${key}`);
    }
    normalizedVariables[key] = value.trim();
  }

  if (Object.keys(normalizedVariables).length === 0) {
    throw new Error('Un thème doit déclarer au moins une variable CSS.');
  }

  return { variables: normalizedVariables };
}

function validateHosts(hosts) {
  if (hosts === undefined) return [];
  if (!Array.isArray(hosts)) throw new Error('Le champ hosts doit être une liste de domaines.');
  return [...new Set(hosts.map((host) => {
    const normalized = String(host || '').trim().toLowerCase();
    if (!HOST_PATTERN.test(normalized)) throw new Error(`Domaine invalide dans hosts: ${host}`);
    return normalized;
  }))];
}

function validateSetting(setting) {
  if (!setting || typeof setting !== 'object') throw new Error('Réglage d’extension invalide.');
  const key = requireString(setting.key, 'settings[].key');
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) throw new Error(`Clé de réglage invalide: ${key}`);
  const type = setting.type || 'string';
  if (!SETTING_TYPES.includes(type)) throw new Error(`Type de réglage invalide pour ${key}: ${type}`);

  const normalized = {
    key,
    type,
    label: optionalString(setting.label) || key,
    description: optionalString(setting.description),
  };

  if (type === 'select') {
    if (!Array.isArray(setting.options) || setting.options.length === 0) {
      throw new Error(`Le réglage ${key} doit définir options.`);
    }
    normalized.options = setting.options.map((option) => (
      typeof option === 'object' && option
        ? { value: String(option.value), label: String(option.label ?? option.value) }
        : { value: String(option), label: String(option) }
    ));
  }

  const fallback = { boolean: false, string: '', number: 0, select: normalized.options?.[0]?.value }[type];
  normalized.default = coerceSettingValue(normalized, setting.default ?? fallback);
  if (type === 'number') {
    if (Number.isFinite(setting.min)) normalized.min = setting.min;
    if (Number.isFinite(setting.max)) normalized.max = setting.max;
  }
  return normalized;
}

function validateSettings(settings) {
  if (settings === undefined) return [];
  if (!Array.isArray(settings)) throw new Error('Le champ settings doit être une liste.');
  const normalized = settings.map(validateSetting);
  const keys = new Set();
  for (const { key } of normalized) {
    if (keys.has(key)) throw new Error(`Réglage dupliqué: ${key}`);
    keys.add(key);
  }
  return normalized;
}

export function coerceSettingValue(setting, value) {
  switch (setting.type) {
    case 'boolean':
      return Boolean(value);
    case 'number': {
      const number = Number(value);
      if (!Number.isFinite(number)) return setting.default ?? 0;
      return Math.min(setting.max ?? Infinity, Math.max(setting.min ?? -Infinity, number));
    }
    case 'select': {
      const text = String(value ?? '');
      return setting.options.some((option) => option.value === text)
        ? text
        : (setting.default ?? setting.options[0].value);
    }
    default:
      return String(value ?? '').slice(0, 2000);
  }
}

// Fills every declared setting, coercing stored values to their declared type.
export function resolveExtensionConfig(manifest, stored = {}) {
  const config = {};
  for (const setting of manifest.settings || []) {
    config[setting.key] = Object.prototype.hasOwnProperty.call(stored || {}, setting.key)
      ? coerceSettingValue(setting, stored[setting.key])
      : setting.default;
  }
  return config;
}

export function validateExtensionManifest(rawManifest) {
  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    throw new Error('Le manifeste doit être un objet JSON.');
  }

  const id = requireString(rawManifest.id, 'id');
  if (!ID_PATTERN.test(id)) {
    throw new Error('Le champ id doit utiliser un identifiant DNS inversé.');
  }

  // `type` can be omitted: a manifest with a theme block is a theme.
  const type = rawManifest.type === undefined
    ? (rawManifest.theme ? 'theme' : 'plugin')
    : requireString(rawManifest.type, 'type');
  if (!MANIFEST_TYPES.includes(type)) {
    throw new Error('Le champ type doit valoir plugin ou theme.');
  }

  const manifest = {
    id,
    name: requireString(rawManifest.name, 'name'),
    type,
    version: validateVersion(rawManifest.version, 'version'),
    sdkVersion: validateVersion(rawManifest.sdkVersion || CALTEMP_SDK_VERSION, 'sdkVersion'),
    compatibility: {
      caltemp: optionalString(rawManifest.compatibility?.caltemp) || `>=${CALTEMP_MIN_COMPAT_VERSION}`,
    },
    description: optionalString(rawManifest.description),
    author: optionalString(rawManifest.author),
    license: optionalString(rawManifest.license),
    homepage: optionalString(rawManifest.homepage),
    repository: optionalString(rawManifest.repository),
    changelog: optionalString(rawManifest.changelog),
    permissions: normalizePermissions(rawManifest.permissions || []),
    dependencies: Array.isArray(rawManifest.dependencies) ? rawManifest.dependencies : [],
  };

  if (type === 'plugin') {
    manifest.entry = optionalString(rawManifest.entry) || DEFAULT_ENTRY;
    if (!/^[A-Za-z0-9_.-]+\.m?js$/.test(manifest.entry)) {
      throw new Error('Le champ entry doit être un fichier .js à la racine de l’extension.');
    }
    manifest.hosts = validateHosts(rawManifest.hosts);
    if (manifest.hosts.length > 0 && !manifest.permissions.includes('network')) {
      throw new Error('Le champ hosts exige la permission network.');
    }
    manifest.settings = validateSettings(rawManifest.settings);
  }

  if (type === 'theme') {
    manifest.theme = validateTheme(rawManifest.theme);
  }

  return manifest;
}

const HEADER_PATTERN = /^\s*\/\*\*?[\s*]*@caltemp\b([\s\S]*?)\*\//;
const LIST_FIELDS = new Set(['permissions', 'hosts', 'dependencies']);

/**
 * Reads the metadata block at the top of a single-file plugin:
 *
 *   /**
 *    * @caltemp
 *    * id: com.example.hello
 *    * name: Bonjour
 *    * version: 1.0.0
 *    * permissions: calendar:read, notifications:send
 *    *\/
 *
 * The block is parsed as text, so the plugin's code never runs before the
 * user has seen its permissions. `settings` (structured) needs a JSON value.
 */
export function parsePluginHeader(code) {
  const match = HEADER_PATTERN.exec(String(code || ''));
  if (!match) return null;

  const raw = {};
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.replace(/^\s*\*?\s?/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) continue;

    if (value.startsWith('[') || value.startsWith('{')) {
      try {
        raw[key] = JSON.parse(value);
      } catch {
        throw new Error(`En-tête @caltemp: valeur JSON invalide pour ${key}.`);
      }
    } else if (LIST_FIELDS.has(key)) {
      raw[key] = value.split(',').map((item) => item.trim()).filter(Boolean);
    } else {
      raw[key] = value;
    }
  }
  return raw;
}

/**
 * Builds a validated manifest from a single `.js` file carrying a `@caltemp`
 * header. Throws when the header is missing or invalid.
 */
export function manifestFromPluginSource(code, { entry = DEFAULT_ENTRY } = {}) {
  const header = parsePluginHeader(code);
  if (!header) {
    throw new Error('Ce fichier ne contient pas d’en-tête /** @caltemp … */.');
  }
  return validateExtensionManifest({ ...header, type: 'plugin', entry });
}
