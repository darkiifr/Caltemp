import { describe, expect, it } from 'vitest';
import { getBundledExtensionExamples } from './localExamples';

describe('getBundledExtensionExamples', () => {
  it('exposes bundled examples, including single-file plugins', () => {
    const examples = getBundledExtensionExamples();

    expect(examples.map((example) => example.manifest.id)).toEqual([
      'com.caltemp.examples.week-summary',
      'com.caltemp.examples.hello',
      'com.caltemp.examples.youtube-theme',
      'com.caltemp.examples.minimal-theme',
      'com.caltemp.examples.french-football-gallery',
    ]);
    expect(examples.every((example) => example.folderPath.startsWith('examples/extensions/'))).toBe(true);
    const weekSummary = examples[0];
    expect(weekSummary.manifestText).toBeUndefined();
    expect(weekSummary.manifest.permissions).toEqual(['calendar:read', 'notifications:send']);
    expect(weekSummary.manifest.settings.map((setting) => setting.key)).toEqual(['days', 'showCategories']);
    expect(examples.find((example) => example.manifest.id.endsWith('minimal-theme')).manifest.theme.variables)
      .toEqual({ '--caltemp-accent': '#67e8f9', '--caltemp-panel': 'rgba(8, 47, 73, 0.55)' });
  });
});
