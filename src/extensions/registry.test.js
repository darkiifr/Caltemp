import { describe, expect, it } from 'vitest';
import { compareVersions, normalizeRegistryEntry } from './extensionRegistry';

describe('extensionRegistry', () => {
  it('compares semantic versions', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('normalizes GitHub registry entries', () => {
    const entry = normalizeRegistryEntry({
      id: 'com.caltemp.examples.minimal',
      latestVersion: '1.0.0',
      manifestUrl: 'https://raw.githubusercontent.com/darkiifr/ext/main/manifest.json',
      assetUrl: 'https://github.com/darkiifr/ext/releases/download/v1/plugin.js',
      sha256: 'abc',
      repository: 'https://github.com/darkiifr/ext',
      publishedAt: '2026-06-17T00:00:00.000Z',
      changelogUrl: 'https://github.com/darkiifr/ext/releases/tag/v1',
    });

    expect(entry.source).toBe('github');
    expect(entry.latestVersion).toBe('1.0.0');
  });
});
