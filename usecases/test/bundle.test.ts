import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { build } from 'vite';
import { expect, it } from 'vitest';
import config from '../vite.config';

it('splits large dependencies without changing the entry point result', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'autark-chunks-'));
    try {
        writeFileSync(resolve(root, 'package.json'), JSON.stringify({ type: 'module' }));
        mkdirSync(resolve(root, 'dist'));
        for (const name of ['a', 'b', 'c']) {
            writeFileSync(resolve(root, `dist/${name}.js`), `export default ${JSON.stringify(name.repeat(210_000))};`);
        }
        writeFileSync(resolve(root, 'entry.js'), `
            import a from './dist/a.js';
            import b from './dist/b.js';
            import c from './dist/c.js';
            console.log(a.length + b.length + c.length);
        `);
        const result = await build({
            ...config,
            root,
            configFile: false,
            logLevel: 'silent',
            build: {
                ...config.build,
                outDir: 'output',
                copyPublicDir: false,
                rolldownOptions: {
                    ...config.build?.rolldownOptions,
                    input: resolve(root, 'entry.js'),
                },
            },
        });
        const outputs = Array.isArray(result) ? result : [result];
        const chunks = outputs.flatMap(output => output.output).filter(chunk => chunk.type === 'chunk');
        expect(chunks.reduce((size, chunk) => size + Buffer.byteLength(chunk.code), 0)).toBeGreaterThan(600_000);
        expect(chunks.every(chunk => Buffer.byteLength(chunk.code) <= 500_000)).toBe(true);
        const entry = chunks.find(chunk => chunk.isEntry)!;
        expect(execFileSync(process.execPath, [resolve(root, 'output', entry.fileName)], { encoding: 'utf8' }).trim()).toBe('630000');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
