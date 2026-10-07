import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dirs = ['autk-core', 'autk-map', 'autk-db', 'autk-plot', 'autk-compute', 'autk'];
const destination = resolve(process.argv[2] ?? '.cache/npm-release');
mkdirSync(destination, { recursive: true });
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const packages = dirs.map(dir => {
    const [packed] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], {
        cwd: resolve(dir), encoding: 'utf8',
    }));
    return { dir, name: packed.name, version: packed.version, filename: packed.filename, integrity: packed.integrity };
});
writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, commit, runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null, packages,
}, null, 2) + '\n');
console.log(`Packed ${packages.length} packages from ${commit} into ${destination}`);
