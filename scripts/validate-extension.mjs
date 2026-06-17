import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateExtensionManifest } from '../src/extensions/manifest.js';

const roots = [
  'examples/extensions/minimal-plugin/manifest.json',
  'examples/extensions/minimal-theme/manifest.json',
];

let failures = 0;

for (const manifestPath of roots) {
  try {
    const manifest = JSON.parse(await readFile(join(process.cwd(), manifestPath), 'utf8'));
    validateExtensionManifest(manifest);
    console.log(`OK ${manifestPath}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${manifestPath}: ${error.message}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
