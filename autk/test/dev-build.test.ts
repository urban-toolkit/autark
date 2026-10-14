import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadConfigFromFile } from 'vite';
import { describe, expect, it } from 'vitest';

it('cleans every workspace without installed tools and preserves sources and the lockfile', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'autark-clean-'));
  const workspaces = ['autk-core', 'autk-map', 'autk-db', 'autk-plot', 'autk-compute', 'autk', 'gallery', 'usecases'];
  try {
    writeFileSync(resolve(fixture, 'package-lock.json'), '{}');
    for (const dir of workspaces) {
      for (const artifact of ['dist', 'build', 'node_modules']) {
        mkdirSync(resolve(fixture, dir, artifact), { recursive: true });
        writeFileSync(resolve(fixture, dir, artifact, 'fixture'), '');
      }
      writeFileSync(resolve(fixture, dir, 'source.ts'), '');
    }
    execFileSync('make', ['-f', resolve('Makefile'), 'clean'], { cwd: fixture });
    mkdirSync(resolve(fixture, 'node_modules'));
    execFileSync('make', ['-f', resolve('Makefile'), 'clean'], { cwd: fixture });
    execFileSync('make', ['-f', resolve('Makefile'), 'clean'], { cwd: fixture });
    expect(existsSync(resolve(fixture, 'node_modules'))).toBe(false);
    expect(existsSync(resolve(fixture, 'package-lock.json'))).toBe(true);
    for (const dir of workspaces) {
      expect(existsSync(resolve(fixture, dir, 'source.ts'))).toBe(true);
      for (const artifact of ['dist', 'build', 'node_modules']) {
        expect(existsSync(resolve(fixture, dir, artifact))).toBe(false);
      }
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe('workspace library watch builds', () => {
  it.each([
    ['autk-core', 'vite.config.ts'],
    ['autk-compute', 'vite.config.ts'],
    ['autk-map', 'vite.config.js'],
    ['autk-plot', 'vite.config.js'],
    ['autk-db', 'vite.config.ts'],
    ['autk', 'vite.config.ts'],
  ])('resolves %s entry paths with the native config loader', async (pkg, file) => {
    const root = resolve(pkg);
    const loaded = await loadConfigFromFile(
      { command: 'build', mode: 'production' }, resolve(root, file), root,
      undefined, undefined, 'native',
    );
    const lib = loaded?.config.build?.lib;
    expect(lib && lib.entry).toEqual(pkg === 'autk'
      ? Object.fromEntries(['index', 'core', 'map', 'db', 'compute', 'plot'].map(name => [name, resolve(root, `src/${name}.ts`)]))
      : resolve(root, 'src/index.ts'));
  });

  it.each([
    ['autk-core', 'vite.config.ts'],
    ['autk-compute', 'vite.config.ts'],
    ['autk-map', 'vite.config.js'],
    ['autk-plot', 'vite.config.js'],
  ])('preserves published exports and declarations during %s watch startup', async (pkg, file) => {
    const argv = process.argv;
    try {
      process.argv = [...argv, '--watch'];
      const root = resolve(pkg);
      const watch = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve(root, file), root);
      expect(watch?.config.build?.emptyOutDir).toBe(false);
      process.argv = argv.filter(arg => arg !== '--watch');
      const build = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve(root, file), root);
      expect(build?.config.build?.emptyOutDir).toBe(true);
    } finally {
      process.argv = argv;
    }
  });
});
