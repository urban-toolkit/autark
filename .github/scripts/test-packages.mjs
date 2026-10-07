import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = process.cwd();
const artifacts = resolve(process.argv[2] ?? '.cache/npm-release');
const manifest = JSON.parse(readFileSync(resolve(artifacts, 'manifest.json'), 'utf8'));
const consumer = mkdtempSync(resolve(tmpdir(), 'autark-consumer-'));
try {
    writeFileSync(resolve(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    // Install all tarballs together: internal dependencies resolve to these packages, not registry versions.
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund',
        ...manifest.packages.map(pkg => resolve(artifacts, pkg.filename))], { cwd: consumer, stdio: 'inherit' });
    for (const pkg of manifest.packages) {
        const installed = resolve(consumer, 'node_modules', pkg.name);
        if (!realpathSync(installed).startsWith(realpathSync(consumer) + '/')) {
            throw new Error(`${pkg.name}: consumer install unexpectedly links outside the fixture`);
        }
        const actual = JSON.parse(readFileSync(resolve(installed, 'package.json'), 'utf8'));
        if (actual.version !== pkg.version) throw new Error(`${pkg.name}: installed wrong version`);
    }
    const specifiers = [...manifest.packages.map(pkg => pkg.name),
        ...['core', 'map', 'db', 'compute', 'plot'].map(name => `@urban-toolkit/autk/${name}`)];
    const imports = specifiers.map((name, i) => `import * as pkg${i} from '${name}';`).join('\n');
    writeFileSync(resolve(consumer, 'index.ts'), `${imports}\nconsole.log(${specifiers.map((_, i) => `pkg${i}`).join(', ')});\n`);
    writeFileSync(resolve(consumer, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
            noEmit: true, skipLibCheck: false, types: [], ignoreDeprecations: '6.0' },
        include: ['index.ts'],
    }));
    execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(consumer, 'tsconfig.json')], {
        cwd: consumer, stdio: 'inherit',
    });
    writeFileSync(resolve(consumer, 'node.mjs'), `
        import { strict as assert } from 'node:assert';
        import { ColorMap } from '@urban-toolkit/autk-core';
        import { AutkDb } from '@urban-toolkit/autk-db';
        import { ComputeGpgpu } from '@urban-toolkit/autk-compute';
        import * as core from '@urban-toolkit/autk/core';
        import * as db from '@urban-toolkit/autk/db';
        import * as compute from '@urban-toolkit/autk/compute';
        assert.equal(typeof ColorMap, 'function');
        assert.equal(typeof AutkDb, 'function');
        assert.equal(typeof ComputeGpgpu, 'function');
        assert.equal(core.ColorMap, ColorMap);
        assert.equal(db.AutkDb, AutkDb);
        assert.equal(compute.ComputeGpgpu, ComputeGpgpu);
    `);
    execFileSync(process.execPath, [resolve(consumer, 'node.mjs')], { cwd: consumer, stdio: 'inherit' });
    await build({ root: consumer, configFile: false,
        build: { outDir: resolve(consumer, 'dist'), rolldownOptions: { input: resolve(consumer, 'index.ts') } },
    });
    console.log('Isolated package types, Node imports, and browser bundle passed.');
} finally {
    rmSync(consumer, { recursive: true, force: true });
}
