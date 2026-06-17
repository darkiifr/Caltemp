import { describe, expect, it } from 'vitest';
import { getBundledExtensionExamples } from './localExamples';

describe('getBundledExtensionExamples', () => {
  it('exposes bundled examples as installable folder-shaped extensions', () => {
    const examples = getBundledExtensionExamples();

    expect(examples.map((example) => example.manifest.id)).toEqual([
      'com.caltemp.examples.youtube-theme',
      'com.caltemp.examples.french-football-gallery',
    ]);
    expect(examples.every((example) => example.folderPath.startsWith('examples/extensions/'))).toBe(true);
    expect(examples.find((example) => example.manifest.type === 'plugin').entryCode).toContain('activate');
  });
});
