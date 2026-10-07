import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';

export const packageDirs = ['autk-core', 'autk-map', 'autk-db', 'autk-plot', 'autk-compute', 'autk'];

/** Only successful main-branch pushes in this repository can supply release artifacts. */
export function isTrustedCiRun(run, repository) {
    return run.name === 'CI' && run.path === '.github/workflows/ci.yml' &&
        run.event === 'push' && run.head_branch === 'main' &&
        run.head_repository?.full_name === repository &&
        run.status === 'completed' && run.conclusion === 'success' &&
        /^[a-f0-9]{40}$/.test(run.head_sha);
}

/** Bind tarballs to the exact successful CI attempt and verify contents before any registry mutation. */
export function readReleaseArtifacts(directory, context, root = process.cwd()) {
    const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.commit !== context.commit ||
        manifest.runId !== String(context.runId) || manifest.runAttempt !== String(context.runAttempt) ||
        manifest.packages?.length !== packageDirs.length) throw new Error('Artifact manifest does not match the tested CI attempt');
    for (const [index, pkg] of manifest.packages.entries()) {
        if (pkg.dir !== packageDirs[index] || pkg.name !== `@urban-toolkit/${pkg.dir}` ||
            !semver.valid(pkg.version) || semver.prerelease(pkg.version) ||
            typeof pkg.filename !== 'string' || basename(pkg.filename) !== pkg.filename || !pkg.filename.endsWith('.tgz')) {
            throw new Error('Invalid package in artifact manifest');
        }
        const file = resolve(directory, pkg.filename);
        if (!realpathSync(file).startsWith(realpathSync(directory) + '/')) throw new Error('Artifact escapes its directory');
        const integrity = `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;
        if (integrity !== pkg.integrity) throw new Error(`${pkg.name}: tarball integrity mismatch`);
        const packed = JSON.parse(execFileSync('tar', ['-xOf', file, 'package/package.json'], { encoding: 'utf8' }));
        const source = JSON.parse(readFileSync(resolve(root, pkg.dir, 'package.json'), 'utf8'));
        if (JSON.stringify(packed) !== JSON.stringify(source) || packed.name !== pkg.name || packed.version !== pkg.version) {
            throw new Error(`${pkg.name}: packed manifest does not match the tested checkout`);
        }
        for (const [name, version] of Object.entries({ ...packed.dependencies, ...packed.optionalDependencies, ...packed.peerDependencies })) {
            const internal = manifest.packages.find(item => item.name === name);
            if ((internal && version !== internal.version) || /^(?:file:|link:|workspace:)/.test(version)) {
                throw new Error(`${pkg.name}: invalid published dependency ${name}@${version}`);
            }
        }
    }
    return manifest;
}

/** Routine pushes are no-ops; a release commit must explicitly increase package versions. */
export function selectReleasePackages(packages, previous) {
    const selected = packages.filter(pkg => {
        const old = previous[pkg.dir];
        if (!semver.valid(old)) throw new Error(`${pkg.name}: previous version is missing or invalid`);
        if (old === pkg.version) return false;
        if (!semver.gt(pkg.version, old)) throw new Error(`${pkg.name}: release version must increase`);
        return true;
    });
    if (selected.length && (selected.length !== packages.length || new Set(selected.map(pkg => pkg.version)).size !== 1)) {
        throw new Error('Coordinated releases must increase all six packages to the same version');
    }
    return selected;
}

/** Registry failures are fatal; only HTTP 404 represents an absent package. */
export async function readRegistryPackage(name) {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
        headers: { Accept: 'application/vnd.npm.install-v1+json' }, signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) return { versions: {}, 'dist-tags': {} };
    if (!response.ok) throw new Error(`${name}: npm registry returned HTTP ${response.status}`);
    const data = await response.json();
    if (!data.versions || !data['dist-tags']) throw new Error(`${name}: invalid npm registry response`);
    return data;
}

/** Complete preflight before staging anything or creating any Git tag. */
export async function preflightRelease(packages, { mode, registry = readRegistryPackage, remoteTag, commit }) {
    const results = [];
    for (const pkg of packages) {
        const data = await registry(pkg.name);
        const published = data.versions[pkg.version];
        if (published && published.dist?.integrity !== pkg.integrity) {
            throw new Error(`${pkg.name}@${pkg.version}: registry integrity differs from the approved artifact`);
        }
        const latest = data['dist-tags'].latest;
        if (latest && (!semver.valid(latest) || semver.gt(latest, pkg.version))) {
            throw new Error(`${pkg.name}@${pkg.version}: refusing to release behind latest (${latest})`);
        }
        if (mode === 'finalize' && (!published || latest !== pkg.version)) {
            throw new Error(`${pkg.name}@${pkg.version}: approve the staged version with npm 2FA first (latest must match)`);
        }
        const tag = `${pkg.name}@${pkg.version}`;
        const existing = await remoteTag(tag);
        if (existing && existing !== commit) throw new Error(`${tag}: remote tag points to a different commit`);
        if (existing && !published) throw new Error(`${tag}: tag exists before npm approval`);
        results.push({ ...pkg, published: Boolean(published), tagged: Boolean(existing) });
    }
    return results;
}

/** Staging is deliberately separate from approval and Git tagging. OIDC cannot inspect pending stages. */
export async function stageRelease(packages, stage, report) {
    for (const pkg of packages) {
        if (pkg.published) {
            report(`${pkg.name}@${pkg.version}: already public; verified integrity, skipping staging.`);
            continue;
        }
        try {
            await stage(pkg);
            report(`${pkg.name}@${pkg.version}: submitted to npm staging; review and approve with 2FA.`);
        } catch (error) {
            report(`${pkg.name}@${pkg.version}: staging failed. Inspect npm Staged Packages before retrying. Approve existing matching stages or reject them with 2FA; never blindly skip a conflict.`);
            throw error;
        }
    }
}

/** Only called after all selected versions have been confirmed public and intact. */
export async function finalizeRelease(packages, createTags, report) {
    const missing = packages.filter(pkg => !pkg.tagged).map(pkg => `${pkg.name}@${pkg.version}`);
    if (missing.length) await createTags(missing);
    for (const pkg of packages) report(`${pkg.name}@${pkg.version}: npm approval verified; Git tag ${pkg.tagged ? 'already existed' : 'created'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const mode = process.argv[2];
    if (!['stage', 'finalize'].includes(mode) || process.env.GITHUB_ACTIONS !== 'true' || process.env.NPM_RELEASE_ENABLED !== 'true') {
        throw new Error('Releases are disabled. Only the explicitly enabled GitHub workflow may stage or finalize a release.');
    }
    const directory = resolve(process.argv[3]);
    const context = { commit: process.env.RELEASE_SHA, runId: process.env.RELEASE_RUN_ID, runAttempt: process.env.RELEASE_RUN_ATTEMPT };
    const current = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (current !== context.commit) throw new Error('Checkout does not match tested commit');
    const manifest = readReleaseArtifacts(directory, context);
    const previous = Object.fromEntries(packageDirs.map(dir => [dir, JSON.parse(execFileSync('git', ['show', `HEAD^:${dir}/package.json`], { encoding: 'utf8' })).version]));
    const selected = selectReleasePackages(manifest.packages, previous);
    const report = message => {
        console.log(message);
        if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${message}\n`);
    };
    if (!selected.length) {
        report('No package version changes: nothing to stage or tag.');
    } else {
        const packages = await preflightRelease(selected, { mode, commit: current,
            remoteTag: tag => {
                const output = execFileSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: 'utf8' }).trim();
                const entries = output ? output.split('\n').map(line => line.split(/\s+/)) : [];
                return entries.find(([, ref]) => ref.endsWith('^{}'))?.[0] ?? entries[0]?.[0] ?? null;
            },
        });
        if (mode === 'stage') {
            await stageRelease(packages, pkg => execFileSync('npm', ['stage', 'publish', resolve(directory, pkg.filename),
                '--access=public', '--tag=latest', '--provenance', '--ignore-scripts'], {
                stdio: 'inherit',
                // workflow_run's default GITHUB_SHA can be newer than the tested checkout.
                env: { ...process.env, GITHUB_SHA: current },
            }), report);
        } else {
            await finalizeRelease(packages, tags => {
                for (const tag of tags) execFileSync('git', ['tag', tag, current]);
                execFileSync('git', ['push', '--atomic', 'origin', ...tags.map(tag => `refs/tags/${tag}`)], { stdio: 'inherit' });
            }, report);
        }
    }
}
