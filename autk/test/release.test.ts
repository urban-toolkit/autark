import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ensureGitHubRelease, finalizeRelease, isTrustedCiRun, packageDirs, preflightRelease,
    readRegistryPackage, readReleaseArtifacts, selectReleasePackages, stageRelease,
} from '../../.github/scripts/release.mjs';

const commit = 'a'.repeat(40);
const pkg = { dir: 'autk-core', name: '@urban-toolkit/autk-core', version: '4.0.0', filename: 'core.tgz', integrity: 'sha512-test' };
const trusted = { name: 'CI', path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main',
    head_repository: { full_name: 'urban-toolkit/autark' }, status: 'completed', conclusion: 'success', head_sha: commit };
const registry = { versions: {}, 'dist-tags': { latest: '3.0.1' } };
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('release authorization', () => {
    it('accepts only the successful main push CI', () => {
        expect(isTrustedCiRun(trusted, 'urban-toolkit/autark')).toBe(true);
    });
    it.each([
        { event: 'pull_request' }, { head_branch: 'feature' }, { conclusion: 'failure' },
        { status: 'in_progress' }, { head_repository: { full_name: 'fork/autark' } },
        { path: '.github/workflows/other.yml' }, { name: 'Other' }, { head_sha: 'invalid' },
    ])('rejects untrusted context %j', change => {
        expect(isTrustedCiRun({ ...trusted, ...change }, 'urban-toolkit/autark')).toBe(false);
    });
    it('does not stage or tag from a local invocation', () => {
        expect(() => execFileSync(process.execPath, [resolve('.github/scripts/release.mjs'), 'stage', '/tmp/no-artifact'], {
            env: { ...process.env, GITHUB_ACTIONS: 'false', NPM_RELEASE_ENABLED: 'false' }, stdio: 'pipe',
        })).toThrow();
    });
    it('ignores unchanged versions and rejects downgrades', () => {
        expect(selectReleasePackages([pkg], { 'autk-core': '4.0.0' })).toEqual([]);
        expect(selectReleasePackages([pkg], { 'autk-core': '3.0.1' })).toEqual([pkg]);
        expect(() => selectReleasePackages([pkg], { 'autk-core': '4.1.0' })).toThrow('must increase');
        expect(() => selectReleasePackages([pkg, { ...pkg, dir: 'autk-db' }], {
            'autk-core': '3.0.1', 'autk-db': '4.0.0',
        })).toThrow('Coordinated releases');
    });
});

describe('release artifact provenance', () => {
    it('checks run identity, hashes, packed manifests, and internal dependencies', () => {
        const root = mkdtempSync(resolve(tmpdir(), 'autark-release-'));
        roots.push(root);
        const artifacts = resolve(root, 'artifacts');
        mkdirSync(artifacts);
        const packages = packageDirs.map(dir => {
            const source = resolve(root, dir);
            const staging = resolve(root, 'packing', dir, 'package');
            mkdirSync(source, { recursive: true });
            mkdirSync(staging, { recursive: true });
            const manifest = { name: `@urban-toolkit/${dir}`, version: '4.0.0' };
            for (const path of [source, staging]) writeFileSync(resolve(path, 'package.json'), JSON.stringify(manifest));
            const filename = `${dir}.tgz`;
            execFileSync('tar', ['-czf', resolve(artifacts, filename), '-C', resolve(staging, '..'), 'package']);
            const integrity = `sha512-${createHash('sha512').update(readFileSync(resolve(artifacts, filename))).digest('base64')}`;
            return { dir, ...manifest, filename, integrity };
        });
        const manifest = { schemaVersion: 1, commit, runId: '12', runAttempt: '1', packages };
        const file = resolve(artifacts, 'manifest.json');
        writeFileSync(file, JSON.stringify(manifest));
        const context = { commit, runId: '12', runAttempt: '1' };
        expect(readReleaseArtifacts(artifacts, context, root).packages).toHaveLength(6);
        expect(() => readReleaseArtifacts(artifacts, { ...context, runAttempt: '2' }, root)).toThrow('tested CI attempt');
        writeFileSync(file, JSON.stringify({ ...manifest, packages: [{ ...packages[0], filename: '../core.tgz' }, ...packages.slice(1)] }));
        expect(() => readReleaseArtifacts(artifacts, context, root)).toThrow('Invalid package');
        writeFileSync(file, JSON.stringify({ ...manifest, packages: [{ ...packages[0], integrity: 'wrong' }, ...packages.slice(1)] }));
        expect(() => readReleaseArtifacts(artifacts, context, root)).toThrow('integrity mismatch');
        writeFileSync(file, JSON.stringify(manifest));
        writeFileSync(resolve(root, packageDirs[0], 'package.json'), JSON.stringify({ name: packages[0].name, version: '4.0.1' }));
        expect(() => readReleaseArtifacts(artifacts, context, root)).toThrow('tested checkout');
    });
});

describe('registry and tag preflight', () => {
    it('only considers HTTP 404 absent; authentication and server errors abort', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch');
        fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
        expect(await readRegistryPackage(pkg.name)).toEqual({ versions: {}, 'dist-tags': {} });
        for (const status of [401, 403, 429, 500]) {
            fetch.mockResolvedValueOnce(new Response('', { status }));
            await expect(readRegistryPackage(pkg.name)).rejects.toThrow(`HTTP ${status}`);
        }
        fetch.mockRejectedValueOnce(new Error('timeout'));
        await expect(readRegistryPackage(pkg.name)).rejects.toThrow('timeout');
    });
    it('rejects malformed registry data', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}));
        await expect(readRegistryPackage(pkg.name)).rejects.toThrow('invalid npm registry response');
    });
    it('requires exact integrity before skipping an already public version', async () => {
        const remoteTag = vi.fn().mockResolvedValue(null);
        const published = { versions: { '4.0.0': { dist: { integrity: pkg.integrity } } }, 'dist-tags': { latest: '4.0.0' } };
        expect((await preflightRelease([pkg], { mode: 'stage', commit, remoteTag, registry: async () => published }))[0].published).toBe(true);
        await expect(preflightRelease([pkg], { mode: 'stage', commit, remoteTag,
            registry: async () => ({ ...published, versions: { '4.0.0': { dist: { integrity: 'different' } } } }),
        })).rejects.toThrow('registry integrity differs');
    });
    it('rejects older latest, conflicting tags, and tags created before approval', async () => {
        await expect(preflightRelease([pkg], { mode: 'stage', commit, remoteTag: async () => null,
            registry: async () => ({ ...registry, 'dist-tags': { latest: '4.1.0' } }),
        })).rejects.toThrow('behind latest');
        await expect(preflightRelease([pkg], { mode: 'stage', commit, remoteTag: async () => 'b'.repeat(40), registry: async () => registry })).rejects.toThrow('different commit');
        await expect(preflightRelease([pkg], { mode: 'stage', commit, remoteTag: async () => commit, registry: async () => registry })).rejects.toThrow('before npm approval');
    });
    it('cannot finalize before every package is public and latest matches', async () => {
        await expect(preflightRelease([pkg], { mode: 'finalize', commit, remoteTag: async () => null,
            registry: async () => registry })).rejects.toThrow('2FA first');
        const approved = { versions: { '4.0.0': { dist: { integrity: pkg.integrity } } }, 'dist-tags': { latest: '4.0.0' } };
        const result = await preflightRelease([pkg], { mode: 'finalize', commit, remoteTag: async () => commit, registry: async () => approved });
        expect(result[0]).toMatchObject({ published: true, tagged: true });
    });
});

describe('staging and recovery', () => {
    it('skips verified public packages and stages remaining packages without tagging', async () => {
        const stage = vi.fn();
        const report = vi.fn();
        await stageRelease([{ ...pkg, published: true }, { ...pkg, name: '@urban-toolkit/autk-db', published: false }], stage, report);
        expect(stage).toHaveBeenCalledTimes(1);
        expect(stage.mock.calls[0][0].name).toBe('@urban-toolkit/autk-db');
    });
    it('aborts on stage conflicts and explains manual 2FA recovery', async () => {
        const report = vi.fn();
        await expect(stageRelease([{ ...pkg, published: false }], async () => { throw new Error('E409'); }, report)).rejects.toThrow('E409');
        expect(report.mock.calls[0][0]).toContain('never blindly skip a conflict');
    });
    it('creates missing tags in one batch and leaves matching tags alone', async () => {
        const tags = vi.fn();
        const release = vi.fn();
        await finalizeRelease([{ ...pkg, tagged: true }, { ...pkg, name: '@urban-toolkit/autk-db', tagged: false }], tags, vi.fn(), release);
        expect(tags).toHaveBeenCalledExactlyOnceWith(['@urban-toolkit/autk-db@4.0.0']);
        expect(release).toHaveBeenCalledOnce();
        expect(tags.mock.invocationCallOrder[0]).toBeLessThan(release.mock.invocationCallOrder[0]);
    });
    it('creates the GitHub Release on a retry even if all tags already exist', async () => {
        const tags = vi.fn();
        const release = vi.fn();
        await finalizeRelease([{ ...pkg, tagged: true }], tags, vi.fn(), release);
        expect(tags).not.toHaveBeenCalled();
        expect(release).toHaveBeenCalledOnce();
    });
    it('does not create a GitHub Release if tag creation fails', async () => {
        const release = vi.fn();
        await expect(finalizeRelease([{ ...pkg, tagged: false }], async () => {
            throw new Error('tag push failed');
        }, vi.fn(), release)).rejects.toThrow('tag push failed');
        expect(release).not.toHaveBeenCalled();
    });
    it('propagates GitHub Release failures so finalization can be retried', async () => {
        await expect(finalizeRelease([{ ...pkg, tagged: true }], vi.fn(), vi.fn(), async () => {
            throw new Error('release failed');
        })).rejects.toThrow('release failed');
    });
});

describe('GitHub Releases', () => {
    const options = { repository: 'urban-toolkit/autark', token: 'test-token', version: '4.1.0', notes: 'Migration notes' };
    it('creates a stable Latest release only when the tag has no release', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(Response.json({ html_url: 'https://github.com/urban-toolkit/autark/releases/4.1.0' }, { status: 201 }));
        await ensureGitHubRelease(options);
        const [url, request] = fetch.mock.calls[1];
        expect(url).toBe('https://api.github.com/repos/urban-toolkit/autark/releases');
        expect(request?.method).toBe('POST');
        expect(JSON.parse(request?.body as string)).toEqual({ tag_name: '@urban-toolkit/autk@4.1.0', name: 'Autark 4.1.0',
            body: 'Migration notes', draft: false, prerelease: false, make_latest: 'true' });
    });
    it('marks an existing release Latest without overwriting maintainer notes', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(Response.json({ id: 123, tag_name: '@urban-toolkit/autk@4.1.0', draft: false, prerelease: false }))
            .mockResolvedValueOnce(Response.json({ html_url: 'release-url' }));
        await ensureGitHubRelease(options);
        expect(fetch.mock.calls[1][0]).toBe('https://api.github.com/repos/urban-toolkit/autark/releases/123');
        expect(fetch.mock.calls[1][1]?.method).toBe('PATCH');
        expect(JSON.parse(fetch.mock.calls[1][1]?.body as string)).toEqual({ make_latest: 'true' });
    });
    it.each([401, 403, 429, 500])('does not treat HTTP %i as a missing release', async status => {
        const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status }));
        await expect(ensureGitHubRelease(options)).rejects.toThrow(`HTTP ${status}`);
        expect(fetch).toHaveBeenCalledOnce();
    });
    it.each([{ draft: true }, { prerelease: true }, { tag_name: 'wrong' }, { id: undefined }])('rejects unexpected existing releases %j', async change => {
        const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
            id: 123, tag_name: '@urban-toolkit/autk@4.1.0', draft: false, prerelease: false, ...change,
        }));
        await expect(ensureGitHubRelease(options)).rejects.toThrow('expected public stable release');
        expect(fetch).toHaveBeenCalledOnce();
    });
    it('propagates a failed release creation', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(new Response('', { status: 422 }));
        await expect(ensureGitHubRelease(options)).rejects.toThrow('HTTP 422');
    });
    it('requires explicit GitHub credentials', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch');
        await expect(ensureGitHubRelease({ ...options, token: '' })).rejects.toThrow('GH_TOKEN');
        expect(fetch).not.toHaveBeenCalled();
    });
});

it('prepares every manifest and the lockfile without any publication', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'autark-prepare-release-'));
    roots.push(root);
    const dirs = [...packageDirs, 'gallery', 'usecases'];
    writeFileSync(resolve(root, 'package.json'), JSON.stringify({ name: 'release-fixture', private: true, workspaces: dirs }));
    for (const dir of dirs) {
        mkdirSync(resolve(root, dir));
        writeFileSync(resolve(root, dir, 'package.json'), JSON.stringify({
            name: packageDirs.includes(dir) ? `@urban-toolkit/${dir}` : dir,
            version: '3.0.1', dependencies: dir === 'autk-core' ? {} : { '@urban-toolkit/autk-core': '3.0.1' },
        }));
    }
    execFileSync(process.execPath, [resolve('.github/scripts/prepare-release.mjs'), '4.0.0'], { cwd: root, stdio: 'pipe' });
    for (const dir of dirs) {
        const manifest = JSON.parse(readFileSync(resolve(root, dir, 'package.json'), 'utf8'));
        expect(manifest.version).toBe(packageDirs.includes(dir) ? '4.0.0' : '3.0.1');
        if (dir !== 'autk-core') expect(manifest.dependencies['@urban-toolkit/autk-core']).toBe('4.0.0');
    }
    expect(JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')).packages['autk-core'].version).toBe('4.0.0');
}, 30_000);

it('keeps publication opt-in and never grants CI npm credentials', () => {
    const stage = readFileSync('.github/workflows/publish.yml', 'utf8');
    expect(stage).toContain("vars.NPM_RELEASE_ENABLED == 'true'");
    expect(stage).toContain("github.event.workflow_run.event == 'push'");
    expect(stage).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
    expect(stage).toContain('environment: npm-release');
    expect(stage).toContain('id-token: write');
    expect(stage).not.toContain('contents: write');
    expect(stage).not.toContain('NPM_TOKEN');
    expect(stage).not.toContain('npm publish');
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(ci).toContain('npm ci');
    expect(ci).toContain('npm run test:packages');
    expect(ci).not.toContain('id-token: write');
    expect(ci).not.toContain('NPM_TOKEN');
    const finalize = readFileSync('.github/workflows/finalize-release.yml', 'utf8');
    expect(finalize).toContain('GH_TOKEN: ${{ github.token }}');
    expect(finalize).toContain('contents: write');
    expect(finalize).not.toContain('id-token: write');
});
