export const CALTEMP_GITHUB_RELEASES_API = 'https://api.github.com/repos/darkiifr/Caltemp/releases';

function releaseTagForVersion(version = '') {
  const normalized = String(version || '').trim();
  if (!normalized) return '';
  return normalized.startsWith('v') ? normalized : `v${normalized}`;
}

function copyUpdateWithReleaseNotes(update, changes) {
  const enriched = {
    ...update,
    ...changes,
  };
  if (typeof update?.downloadAndInstall === 'function') {
    enriched.downloadAndInstall = (...args) => update.downloadAndInstall.apply(update, args);
  }
  return enriched;
}

export async function fetchGithubReleaseNotes(version, { fetcher = globalThis.fetch } = {}) {
  if (typeof fetcher !== 'function') throw new Error('Aucun client HTTP disponible.');
  const tag = releaseTagForVersion(version);
  if (!tag) throw new Error('Version de mise à jour inconnue.');

  const response = await fetcher(`${CALTEMP_GITHUB_RELEASES_API}/tags/${encodeURIComponent(tag)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });
  if (!response?.ok) throw new Error(`HTTP ${response?.status || 'inconnu'}`);

  const release = await response.json();
  return {
    body: release?.body || '',
    releaseUrl: release?.html_url || `${CALTEMP_GITHUB_RELEASES_API.replace('api.github.com/repos', 'github.com')}/tag/${tag}`,
  };
}

export async function enrichUpdateWithGithubReleaseNotes(update, options = {}) {
  if (!update?.version) return update;

  try {
    const notes = await fetchGithubReleaseNotes(update.version, options);
    return copyUpdateWithReleaseNotes(update, {
      body: notes.body || update.body || '',
      releaseUrl: notes.releaseUrl,
      releaseNotesSource: notes.body ? 'github' : 'updater',
    });
  } catch (error) {
    return copyUpdateWithReleaseNotes(update, {
      body: update.body || '',
      releaseNotesError: error?.message || String(error),
      releaseNotesSource: 'updater',
    });
  }
}
