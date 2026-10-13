import { describe, expect, it } from 'vitest';
import { CALTEMP_SDK_VERSION } from './constants';
import {
  manifestFromPluginSource,
  parsePluginHeader,
  resolveExtensionConfig,
  validateExtensionManifest,
} from './manifest';

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

describe('simplified manifests', () => {
  it('fills defaults so id, name and version are enough for a plugin', () => {
    const manifest = validateExtensionManifest({ id: 'com.example.tiny', name: 'Tiny', version: '1.0.0' });

    expect(manifest).toMatchObject({
      type: 'plugin',
      entry: 'index.js',
      sdkVersion: CALTEMP_SDK_VERSION,
      compatibility: { caltemp: '>=6.0.0' },
      permissions: [],
      hosts: [],
      settings: [],
    });
  });

  it('infers themes and expands the colors shorthand', () => {
    const manifest = validateExtensionManifest({
      id: 'com.example.theme',
      name: 'Theme',
      version: '1.0.0',
      theme: { colors: { accent: '#ff0033' }, variables: { '--caltemp-panel': '#000' } },
    });

    expect(manifest.type).toBe('theme');
    expect(manifest.theme.variables).toEqual({ '--caltemp-accent': '#ff0033', '--caltemp-panel': '#000' });
  });

  it('accepts SDK 1.x permissions without granting anything new', () => {
    const manifest = validateExtensionManifest({
      id: 'com.example.legacy',
      name: 'Legacy',
      version: '1.0.0',
      permissions: ['storage:extension', 'calendar:read'],
    });

    expect(manifest.permissions).toEqual(['calendar:read']);
  });

  it('requires the network permission to declare hosts', () => {
    const base = { id: 'com.example.net', name: 'Net', version: '1.0.0', hosts: ['api.example.com'] };
    expect(() => validateExtensionManifest(base)).toThrow(/network/);
    expect(validateExtensionManifest({ ...base, permissions: ['network'] }).hosts).toEqual(['api.example.com']);
  });

  it('validates declared settings and resolves stored values against them', () => {
    const manifest = validateExtensionManifest({
      id: 'com.example.settings',
      name: 'Settings',
      version: '1.0.0',
      settings: [
        { key: 'enabled', type: 'boolean', default: true },
        { key: 'count', type: 'number', default: 3, min: 1, max: 5 },
        { key: 'mode', type: 'select', options: ['a', 'b'] },
      ],
    });

    expect(resolveExtensionConfig(manifest, {})).toEqual({ enabled: true, count: 3, mode: 'a' });
    expect(resolveExtensionConfig(manifest, { enabled: 0, count: '99', mode: 'zzz', extra: 1 }))
      .toEqual({ enabled: false, count: 5, mode: 'a' });
    expect(() => validateExtensionManifest({ ...manifest, settings: [{ key: 'x', type: 'color' }] })).toThrow(/Type/);
  });
});

describe('single-file plugins', () => {
  const source = `/**
 * @caltemp
 * id: com.example.hello
 * name: Bonjour
 * version: 1.2.0
 * permissions: calendar:read, notifications:send
 * settings: [{"key":"greeting","label":"Salutation","default":"Salut"}]
 */
export function activate(ctx) {}
`;

  it('reads the manifest from the @caltemp header without running the code', () => {
    expect(parsePluginHeader(source)).toMatchObject({
      id: 'com.example.hello',
      permissions: ['calendar:read', 'notifications:send'],
    });

    const manifest = manifestFromPluginSource(source);
    expect(manifest).toMatchObject({ id: 'com.example.hello', type: 'plugin', version: '1.2.0', entry: 'index.js' });
    expect(manifest.settings[0]).toMatchObject({ key: 'greeting', type: 'string', default: 'Salut' });
  });

  it('rejects files without a header', () => {
    expect(parsePluginHeader('export function activate() {}')).toBeNull();
    expect(() => manifestFromPluginSource('export function activate() {}')).toThrow(/@caltemp/);
  });
});
