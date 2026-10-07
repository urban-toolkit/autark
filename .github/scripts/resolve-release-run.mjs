import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { isTrustedCiRun, packageDirs, selectReleasePackages } from './release.mjs';

const id = process.env.CI_RUN_ID;
const repository = process.env.GITHUB_REPOSITORY;
if (!/^\d+$/.test(id ?? '') || !repository || !process.env.GH_TOKEN) throw new Error('A CI run ID and GitHub API credentials are required');
const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${id}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Cannot inspect CI run: HTTP ${response.status}`);
const run = await response.json();
if (!isTrustedCiRun(run, repository)) throw new Error('Only successful CI runs from main-branch pushes in this repository are eligible');
execFileSync('git', ['fetch', '--no-tags', 'origin', run.head_sha, '--depth=2'], { stdio: 'inherit' });
const packages = packageDirs.map(dir => {
    const manifest = JSON.parse(execFileSync('git', ['show', `${run.head_sha}:${dir}/package.json`], { encoding: 'utf8' }));
    return { dir, name: manifest.name, version: manifest.version };
});
const previous = Object.fromEntries(packageDirs.map(dir => [dir,
    JSON.parse(execFileSync('git', ['show', `${run.head_sha}^:${dir}/package.json`], { encoding: 'utf8' })).version,
]));
const hasRelease = selectReleasePackages(packages, previous).length > 0;
const output = `sha=${run.head_sha}\nrun_id=${run.id}\nrun_attempt=${run.run_attempt}\nartifact=npm-packages-${run.id}-${run.run_attempt}\nhas_release=${hasRelease}\n`;
appendFileSync(process.env.GITHUB_OUTPUT, output);
