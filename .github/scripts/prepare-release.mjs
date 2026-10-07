import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import semver from 'semver';
import { packageDirs } from './release.mjs';

const version = process.argv[2];
if (!semver.valid(version) || semver.prerelease(version) || semver.valid(version) !== version) {
    throw new Error('Usage: npm run release:prepare -- <stable-version>, e.g. 4.0.0. This command only edits manifests and the lockfile.');
}
const files = [...packageDirs, 'gallery', 'usecases'].map(dir => {
    const file = resolve(dir, 'package.json');
    return { dir, file, manifest: JSON.parse(readFileSync(file, 'utf8')) };
});
const names = new Set(packageDirs.map(dir => `@urban-toolkit/${dir}`));
for (const { dir, manifest } of files) {
    if (packageDirs.includes(dir) && !semver.gt(version, manifest.version)) {
        throw new Error(`${dir}: ${version} must be greater than ${manifest.version}`);
    }
}
for (const { dir, file, manifest } of files) {
    if (packageDirs.includes(dir)) manifest.version = version;
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
        for (const name of Object.keys(manifest[field] ?? {})) {
            if (names.has(name)) manifest[field][name] = version;
        }
    }
    writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
}
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], { stdio: 'inherit' });
console.log(`Prepared coordinated ${version} manifests and lockfile. Nothing was staged, published, committed, or pushed.`);
