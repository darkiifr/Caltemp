import fs from 'fs';
import path from 'path';

const packageJsonPath = path.resolve('package.json');
const tauriConfPath = path.resolve('src-tauri/tauri.conf.json');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const currentVersion = packageJson.version;

// Get bump type from args
const args = process.argv.slice(2);
const typeArg = args.find(arg => arg.startsWith('--type='));
const bumpType = typeArg ? typeArg.split('=')[1] : 'patch';

// Parse version
const parts = currentVersion.split('.').map(Number);

if (bumpType === 'major') {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
} else if (bumpType === 'minor') {
    parts[1] += 1;
    parts[2] = 0;
} else {
    parts[2] += 1;
}

const newVersion = parts.join('.');
console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

// Update tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
tauriConf.version = newVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

console.log(`::set-output name=new_version::${newVersion}`);
console.log(newVersion);
