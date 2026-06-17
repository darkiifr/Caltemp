import { validateExtensionManifest } from './manifest.js';

import youtubeThemeManifestText from '../../examples/extensions/youtube-theme/manifest.json?raw';
import frenchFootballManifestText from '../../examples/extensions/french-football-gallery/manifest.json?raw';
import frenchFootballEntryCode from '../../examples/extensions/french-football-gallery/index.js?raw';

const bundledExamples = [
  {
    folderPath: 'examples/extensions/youtube-theme',
    source: 'bundled-example',
    manifestText: youtubeThemeManifestText,
  },
  {
    folderPath: 'examples/extensions/french-football-gallery',
    source: 'bundled-example',
    manifestText: frenchFootballManifestText,
    entryCode: frenchFootballEntryCode,
  },
];

export function getBundledExtensionExamples() {
  return bundledExamples.map((example) => ({
    ...example,
    manifest: validateExtensionManifest(JSON.parse(example.manifestText)),
  }));
}
