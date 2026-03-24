/* eslint-disable no-undef */

import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import fs from 'fs';

const duckdbFiles = [
  'duckdb-mvp.wasm',
  'duckdb-browser-mvp.worker.js',
  'duckdb-eh.wasm',
  'duckdb-browser-eh.worker.js',
];

export default defineConfig({
  plugins: [
    dts(),
    {
      name: 'copy-duckdb-dist',
      closeBundle() {
        const src = resolve(__dirname, 'node_modules/@duckdb/duckdb-wasm/dist');
        const dst = resolve(__dirname, 'dist');
        for (const file of duckdbFiles) {
          if (file.endsWith('.js')) {
            const content = fs.readFileSync(`${src}/${file}`, 'utf8')
              .replace(/^\/\/# sourceMappingURL=.+$/m, '');
            fs.writeFileSync(`${dst}/${file}`, content);
          } else {
            fs.copyFileSync(`${src}/${file}`, `${dst}/${file}`);
          }
        }
      },
    },
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
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
