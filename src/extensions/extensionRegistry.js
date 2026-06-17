import { fetch } from '@tauri-apps/plugin-http';
import { DEFAULT_EXTENSION_REGISTRY_URL } from './constants.js';

function parseVersion(version) {
  return String(version)
    .split(/[+-]/)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }

  return 0;
}

function requireUrl(value, field) {
  if (typeof value !== 'string' || !value.startsWith('https://')) {
    throw new Error(`Entrée registry invalide: ${field} doit être une URL HTTPS.`);
  }
  return value;
}

export function normalizeRegistryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Entrée registry invalide.');
  }

  return {
    id: String(entry.id || '').trim(),
    latestVersion: String(entry.latestVersion || '').trim(),
    manifestUrl: requireUrl(entry.manifestUrl, 'manifestUrl'),
    assetUrl: requireUrl(entry.assetUrl, 'assetUrl'),
    sha256: String(entry.sha256 || '').trim(),
    repository: requireUrl(entry.repository, 'repository'),
    publishedAt: String(entry.publishedAt || '').trim(),
    changelogUrl: requireUrl(entry.changelogUrl, 'changelogUrl'),
    source: 'github',
  };
}

export async function fetchExtensionRegistry(registryUrl = DEFAULT_EXTENSION_REGISTRY_URL) {
  const response = await fetch(registryUrl, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Registry indisponible (${response.status}).`);
  }

  const data = await response.json();
  const entries = Array.isArray(data) ? data : data.extensions;

  if (!Array.isArray(entries)) {
    throw new Error('Le registry doit contenir une liste extensions.');
  }

  return entries.map(normalizeRegistryEntry);
}

export function getInstalledVersionState(registryEntry, installedExtension) {
  if (!installedExtension) return 'available';
  return compareVersions(registryEntry.latestVersion, installedExtension.manifest.version) > 0
    ? 'update'
    : 'installed';
}
