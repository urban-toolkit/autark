import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import glsl from 'vite-plugin-glsl';

function duckdbAssets() {
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
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(resolve(__dirname, '../node_modules/@duckdb/duckdb-wasm/dist', fileName)),
        });
      }
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@autark-schema': resolve(__dirname, '../schema/autark-spec-v0.1.json'),
      '@urban-toolkit/autk-core': resolve(__dirname, '../autk-core/src/index.ts'),
      '@urban-toolkit/autk-db': resolve(__dirname, '../autk-db/src/index.ts'),
      '@urban-toolkit/autk-compute': resolve(__dirname, '../autk-compute/src/index.ts'),
      '@urban-toolkit/autk-map': resolve(__dirname, '../autk-map/src/index.ts'),
      '@urban-toolkit/autk-plot': resolve(__dirname, '../autk-plot/src/index.ts'),
    },
  },
  plugins: [glsl(), duckdbAssets(), dts({ insertTypesEntry: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AutkRuntime',
      fileName: 'autk-runtime',
      formats: ['es'],
    },
    copyPublicDir: false,
    emptyOutDir: true,
    sourcemap: true,
    // Bundle all dependencies for browser use
    // This makes the runtime self-contained for browser/notebook embedding
    rollupOptions: {
      // Don't externalize any dependencies - bundle everything
      external: [],
    },
  },
});
