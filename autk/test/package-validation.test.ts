import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const validator = resolve(import.meta.dirname, '../../.github/scripts/validate-packages.mjs');
let root: string;

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'autark-package-validation-'));
  for (const name of ['autk-core', 'autk-map', 'autk-db', 'autk-plot', 'autk-compute', 'autk']) {
    const dir = resolve(root, name);
    mkdirSync(resolve(dir, 'dist'), { recursive: true });
    writeFileSync(resolve(dir, 'package.json'), JSON.stringify({
      name: `@urban-toolkit/${name}`,
      version: '1.0.0',
      files: ['dist'],
      types: './dist/index.d.ts',
      exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
    }));
    writeFileSync(resolve(dir, 'dist/index.js'), 'export {};\n');
    writeFileSync(resolve(dir, 'dist/index.d.ts'), 'export {};\n');
    if (name === 'autk-db') {
      for (const asset of ['browser.js', 'duckdb-mvp.wasm', 'duckdb-browser-mvp.worker.js', 'duckdb-eh.wasm', 'duckdb-browser-eh.worker.js']) {
        writeFileSync(resolve(dir, 'dist', asset), '');
      }
    }
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('published package declarations', () => {
  it('allows package imports and relative imports within the published package', () => {
    writeFileSync(resolve(root, 'autk-map/dist/local.d.ts'), 'export type Value = number;\n');
    writeFileSync(resolve(root, 'autk-map/dist/index.d.ts'), `
      import type { BoundingBox } from '@urban-toolkit/autk-core';
      export type { Value } from './local';
      export type Box = BoundingBox;
    `);
    // An unpublished source file must not affect artifact validation.
    mkdirSync(resolve(root, 'autk-map/src'));
    writeFileSync(resolve(root, 'autk-map/src/local.d.ts'), "export * from '../../autk-core/src/index.ts';\n");
    const result = spawnSync(process.execPath, [validator], { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Package validation passed.');
  }, 30_000);

  it.each(['d.ts', 'd.cts', 'd.mts'])('rejects sibling source references in packed .%s files', (extension) => {
    writeFileSync(resolve(root, `autk-map/dist/leak.${extension}`), "export type { BoundingBox } from '../../autk-core/src/index.ts';\n");
    const result = spawnSync(process.execPath, [validator], { cwd: root, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`autk-map: dist/leak.${extension} imports ../../autk-core/src/index.ts`);
    expect(result.stderr).toContain('outside the published package');
  }, 30_000);

  it('rejects paths into a sibling whose name starts with the package name', () => {
    writeFileSync(resolve(root, 'autk-map/dist/index.d.ts'), "export * from '../../autk-map-extra/index.d.ts';\n");
    const result = spawnSync(process.execPath, [validator], { cwd: root, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('outside the published package');
  }, 30_000);
});
