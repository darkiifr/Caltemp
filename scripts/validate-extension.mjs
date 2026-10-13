// Validates Caltemp extensions.
//
//   npm run extensions:validate                    every folder in examples/extensions
//   npm run extensions:validate -- my-plugin.js    a single-file plugin
//   npm run extensions:validate -- ./my-theme      a folder with manifest.json
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { manifestFromPluginSource, validateExtensionManifest } from '../src/extensions/manifest.js';

const EXAMPLES_DIR = 'examples/extensions';

async function isFile(path) {
  return stat(path).then((info) => info.isFile(), () => false);
}

async function validateTarget(target) {
  const info = await stat(target);
  const folder = info.isDirectory() ? target : dirname(target);
  const file = info.isDirectory() ? null : basename(target);

  if (file && /\.m?js$/.test(file)) {
    const manifest = manifestFromPluginSource(await readFile(target, 'utf8'));
    return `${manifest.type} ${manifest.id}@${manifest.version} (fichier unique)`;
  }

  const manifestPath = file ? target : join(folder, 'manifest.json');
  if (await isFile(manifestPath)) {
    const manifest = validateExtensionManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    if (manifest.type === 'plugin' && !(await isFile(join(folder, manifest.entry)))) {
      throw new Error(`fichier ${manifest.entry} introuvable`);
    }
    return `${manifest.type} ${manifest.id}@${manifest.version}`;
  }

  const entryPath = join(folder, 'index.js');
  if (await isFile(entryPath)) {
    const manifest = manifestFromPluginSource(await readFile(entryPath, 'utf8'));
    return `${manifest.type} ${manifest.id}@${manifest.version} (fichier unique)`;
  }

  throw new Error('ni manifest.json ni index.js avec en-tête @caltemp');
}

const args = process.argv.slice(2);
const targets = args.length > 0
  ? args.map((arg) => resolve(arg))
  : (await readdir(EXAMPLES_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(EXAMPLES_DIR, entry.name));

let failures = 0;

for (const target of targets) {
  try {
    console.log(`OK ${target}: ${await validateTarget(target)}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${target}: ${error.message}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
