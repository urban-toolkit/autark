import { resolve } from 'node:path';
import { loadConfigFromFile } from 'vite';
import { describe, expect, it } from 'vitest';

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
