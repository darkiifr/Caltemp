import { describe, expect, it } from 'vitest';
import { validateExtensionManifest } from './manifest';

describe('validateExtensionManifest', () => {
  it('accepts a minimal plugin manifest', () => {
    const manifest = validateExtensionManifest({
      id: 'com.caltemp.examples.minimal',
      name: 'Minimal plugin',
      type: 'plugin',
      version: '1.2.3',
      sdkVersion: '1.0.0',
      compatibility: { caltemp: '>=6.0.0' },
      entry: 'index.js',
      permissions: ['calendar:read'],
    });

    expect(manifest.id).toBe('com.caltemp.examples.minimal');
    expect(manifest.permissions).toEqual(['calendar:read']);
  });

  it('rejects unknown permissions', () => {
    expect(() =>
      validateExtensionManifest({
        id: 'com.caltemp.bad',
        name: 'Bad plugin',
        type: 'plugin',
        version: '1.0.0',
        sdkVersion: '1.0.0',
        compatibility: { caltemp: '>=6.0.0' },
        entry: 'index.js',
        permissions: ['fs:all'],
      }),
    ).toThrow(/permission/i);
  });

  it('requires theme variables for theme manifests', () => {
    expect(() =>
      validateExtensionManifest({
        id: 'com.caltemp.theme.empty',
        name: 'Empty theme',
        type: 'theme',
        version: '1.0.0',
        sdkVersion: '1.0.0',
        compatibility: { caltemp: '>=6.0.0' },
      }),
    ).toThrow(/theme/i);
  });
});
