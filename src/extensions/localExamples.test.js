import { describe, expect, it } from 'vitest';
import { getBundledExtensionExamples } from './localExamples';

describe('getBundledExtensionExamples', () => {
  it('bundles every example folder, plugins first then themes', () => {
    const examples = getBundledExtensionExamples();
    const types = examples.map((example) => example.manifest.type);

    expect(types.indexOf('theme')).toBeGreaterThan(0);
    expect(types.slice(types.indexOf('theme')).every((type) => type === 'theme')).toBe(true);
    expect(examples.every((example) => example.folderPath.startsWith('examples/extensions/'))).toBe(true);
    expect(examples.every((example) => example.source === 'bundled-example')).toBe(true);
  });

  it('reads single-file plugins from their header and folder plugins from manifest.json', () => {
    const examples = getBundledExtensionExamples();
    const weekSummary = examples.find((example) => example.manifest.id === 'com.caltemp.examples.week-summary');
    const gallery = examples.find((example) => example.manifest.id === 'com.caltemp.examples.french-football-gallery');

    expect(weekSummary.manifestText).toBeUndefined();
    expect(weekSummary.manifest.permissions).toEqual(['calendar:read', 'notifications:send']);
    expect(weekSummary.manifest.settings.map((setting) => setting.key)).toEqual(['days', 'showCategories']);
    expect(gallery.manifestText).toContain('"Galerie Bleus"');
    expect(gallery.entryCode).toContain('ctx.commands.register');
  });
});
