import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { defineConfig, type Plugin } from 'vite';
import dts from 'vite-plugin-dts';

// Keep the workspace alias out of the emitted declarations: published types must
// import the package, not a path into autk-core's source, which is not published.
const CORE_PACKAGE = '@urban-toolkit/autk-core';

const require = createRequire(import.meta.url);
const duckdbDistDir = dirname(require.resolve('@duckdb/duckdb-wasm'));

function duckdbAssets(): Plugin {
  const assets = [
    'duckdb-mvp.wasm',
    'duckdb-browser-mvp.worker.js',
    'duckdb-eh.wasm',
    'duckdb-browser-eh.worker.js',
  ];

  return {
    name: 'duckdb-assets',
    generateBundle() {
      for (const fileName of assets) {
        const sourcePath = resolve(duckdbDistDir, fileName);
        let source: Buffer | string = readFileSync(sourcePath);

        if (fileName.endsWith('.worker.js')) {
          source = source.toString().replace(/\n\/\/# sourceMappingURL=.*\.map\s*$/, '\n');
        }

        this.emitFile({
          type: 'asset',
          fileName,
          source,
        });
      }
    },
  };
}

const coreAlias = resolve(__dirname, '../autk-core/src/index.ts');
const nodeDuckDbModule = resolve(__dirname, 'src/duckdb-node.ts');
const buildTarget = process.env.AUTK_DB_TARGET === 'node' ? 'node' : 'browser';
const isWatch = process.argv.includes('--watch');
const entry = resolve(__dirname, 'src/index.ts');

export default defineConfig({
  resolve: {
    alias:
      buildTarget === 'node'
        ? [
            {
              find: '@urban-toolkit/autk-core',
              replacement: coreAlias,
            },
            {
              find: './duckdb',
              replacement: nodeDuckDbModule,
            },
          ]
        : {
            '@urban-toolkit/autk-core': coreAlias,
          },
  },
  plugins: buildTarget === 'browser' ? [duckdbAssets(), dts({ aliasesExclude: [CORE_PACKAGE] })] : [],
  build: {
    lib: {
      entry,
      formats: ['es'],
      fileName: () => `${buildTarget}.js`,
    },
    copyPublicDir: false,
    emptyOutDir: buildTarget === 'browser' && !isWatch,
    sourcemap: true,
    rollupOptions: {
      external: ['@duckdb/duckdb-wasm'],
      output: {
        globals: { '@duckdb/duckdb-wasm': 'duckdb' },
      },
    },
  },
});
