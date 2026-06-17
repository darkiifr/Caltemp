import { CALTEMP_SDK_VERSION } from './constants.js';
import { normalizePermissions } from './extensionPermissions.js';

const MANIFEST_TYPES = ['plugin', 'theme'];
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9.-]+[a-z0-9]$/;

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Le champ ${field} est obligatoire.`);
  }
  return value.trim();
}

function validateVersion(version, field) {
  const normalized = requireString(version, field);
  if (!SEMVER_PATTERN.test(normalized)) {
    throw new Error(`Le champ ${field} doit être une version semver.`);
  }
  return normalized;
}

function validateTheme(theme) {
  if (!theme || typeof theme !== 'object') {
    throw new Error('Un manifeste de thème doit définir theme.variables.');
  }

  const variables = theme.variables;
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    throw new Error('Un manifeste de thème doit définir theme.variables.');
  }

  const normalizedVariables = {};
  for (const [key, value] of Object.entries(variables)) {
    if (!key.startsWith('--') || typeof value !== 'string' || !value.trim()) {
      throw new Error(`Variable de thème invalide: ${key}`);
    }
    normalizedVariables[key] = value.trim();
  }

  if (Object.keys(normalizedVariables).length === 0) {
    throw new Error('Un thème doit déclarer au moins une variable CSS.');
  }

  return {
    ...theme,
    variables: normalizedVariables,
  };
}

export function validateExtensionManifest(rawManifest) {
  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    throw new Error('Le manifeste doit être un objet JSON.');
  }

  const id = requireString(rawManifest.id, 'id');
  if (!ID_PATTERN.test(id)) {
    throw new Error('Le champ id doit utiliser un identifiant DNS inversé.');
  }

  const type = requireString(rawManifest.type, 'type');
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
      caltemp: requireString(rawManifest.compatibility?.caltemp, 'compatibility.caltemp'),
    },
    description: typeof rawManifest.description === 'string' ? rawManifest.description : '',
    author: typeof rawManifest.author === 'string' ? rawManifest.author : '',
    license: typeof rawManifest.license === 'string' ? rawManifest.license : '',
    homepage: typeof rawManifest.homepage === 'string' ? rawManifest.homepage : '',
    repository: typeof rawManifest.repository === 'string' ? rawManifest.repository : '',
    changelog: typeof rawManifest.changelog === 'string' ? rawManifest.changelog : '',
    permissions: normalizePermissions(rawManifest.permissions || []),
    dependencies: Array.isArray(rawManifest.dependencies) ? rawManifest.dependencies : [],
  };

  if (type === 'plugin') {
    manifest.entry = requireString(rawManifest.entry, 'entry');
  }

  if (type === 'theme') {
    manifest.theme = validateTheme(rawManifest.theme);
  }

  return manifest;
}
