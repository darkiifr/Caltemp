import { prepareExtension } from './extensionStore.js';

import youtubeThemeManifestText from '../../examples/extensions/youtube-theme/manifest.json?raw';
import minimalThemeManifestText from '../../examples/extensions/minimal-theme/manifest.json?raw';
import helloEntryCode from '../../examples/extensions/hello/index.js?raw';
import weekSummaryEntryCode from '../../examples/extensions/week-summary/index.js?raw';
import frenchFootballManifestText from '../../examples/extensions/french-football-gallery/manifest.json?raw';
import frenchFootballEntryCode from '../../examples/extensions/french-football-gallery/index.js?raw';

// Single-file plugins only provide `entryCode`: their manifest is the
// `@caltemp` header.
const bundledExamples = [
  {
    folderPath: 'examples/extensions/week-summary',
    entryCode: weekSummaryEntryCode,
  },
  {
    folderPath: 'examples/extensions/hello',
    entryCode: helloEntryCode,
  },
  {
    folderPath: 'examples/extensions/youtube-theme',
    manifestText: youtubeThemeManifestText,
  },
  {
    folderPath: 'examples/extensions/minimal-theme',
    manifestText: minimalThemeManifestText,
  },
  {
    folderPath: 'examples/extensions/french-football-gallery',
    manifestText: frenchFootballManifestText,
    entryCode: frenchFootballEntryCode,
  },
];

export function getBundledExtensionExamples() {
  return bundledExamples.map((example) => ({
    source: 'bundled-example',
    ...example,
    manifest: prepareExtension({ manifestText: example.manifestText, code: example.entryCode }).manifest,
  }));
}
