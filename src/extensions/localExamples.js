import { prepareExtension } from './extensionStore.js';

// Every folder in examples/extensions is bundled: `manifest.json` (themes,
// folder-shaped plugins) and/or `index.js` (single-file plugins carry their
// manifest in a `@caltemp` header).
const manifests = import.meta.glob('../../examples/extensions/*/manifest.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const entries = import.meta.glob('../../examples/extensions/*/index.js', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function folderOf(path) {
  return path.replace(/^(?:\.\.\/)+/, '').replace(/\/[^/]+$/, '');
}

const folders = [...new Set([...Object.keys(manifests), ...Object.keys(entries)].map(folderOf))];

const bundledExamples = folders.map((folderPath) => {
  const manifestText = manifests[`../../${folderPath}/manifest.json`];
  const entryCode = entries[`../../${folderPath}/index.js`];
  const { manifest } = prepareExtension({ manifestText, code: entryCode });
  return { folderPath, manifestText, entryCode, manifest };
});

// Plugins first, then themes, each sorted by name.
bundledExamples.sort((a, b) => (
  a.manifest.type === b.manifest.type
    ? a.manifest.name.localeCompare(b.manifest.name, 'fr')
    : a.manifest.type === 'plugin' ? -1 : 1
));

export function getBundledExtensionExamples() {
  return bundledExamples.map((example) => ({ source: 'bundled-example', ...example }));
}
