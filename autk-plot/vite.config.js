 

import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const isWatch = process.argv.includes('--watch');

export default defineConfig({
  resolve: {
    alias: {
      '@urban-toolkit/autk-core': resolve(import.meta.dirname, '../autk-core/src/index.ts'),
    },
  },
  plugins: [dts()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'autk-plot',
    },
    copyPublicDir: false,
    emptyOutDir: !isWatch,
    sourcemap: true
  },
});
