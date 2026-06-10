 
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

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
      '@urban-toolkit/autk-core': resolve(__dirname, '../autk-core/src/index.ts'),
    },
  },
  plugins: [duckdbAssets(), dts()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'autk-db',
      formats: ['es'],
    },
    copyPublicDir: false,
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      external: ['@duckdb/duckdb-wasm'],
      output: {
        globals: { '@duckdb/duckdb-wasm': 'duckdb' },
      },
    },
  },
});
