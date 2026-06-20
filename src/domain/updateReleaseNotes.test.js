import { describe, expect, it, vi } from 'vitest';
import { enrichUpdateWithGithubReleaseNotes } from './updateReleaseNotes';

function jsonResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

describe('update release notes', () => {
  it('uses the GitHub release body for the available updater version', async () => {
    const update = {
      version: '6.0.1',
      body: '',
      downloadAndInstall: vi.fn(),
    };
    const fetcher = vi.fn(async (url) => {
      expect(url).toBe('https://api.github.com/repos/darkiifr/Caltemp/releases/tags/v6.0.1');
      return jsonResponse({
        body: '## Corrections\n- Changelog restauré',
        html_url: 'https://github.com/darkiifr/Caltemp/releases/tag/v6.0.1',
      });
    });

    const enriched = await enrichUpdateWithGithubReleaseNotes(update, { fetcher });

    expect(enriched).toMatchObject({
      version: '6.0.1',
      body: '## Corrections\n- Changelog restauré',
      releaseUrl: 'https://github.com/darkiifr/Caltemp/releases/tag/v6.0.1',
    });
    await enriched.downloadAndInstall();
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it('keeps updater notes when GitHub release notes are unavailable', async () => {
    const update = {
      version: '6.0.1',
      body: 'Notes updater',
      downloadAndInstall: vi.fn(),
    };
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 404,
    }));

    const enriched = await enrichUpdateWithGithubReleaseNotes(update, { fetcher });

    expect(enriched.body).toBe('Notes updater');
    expect(enriched.releaseNotesError).toContain('HTTP 404');
  });
});
