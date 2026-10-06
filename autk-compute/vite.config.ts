 

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
  // Published declarations must reference the core package, not its workspace source.
  plugins: [dts({ aliasesExclude: ['@urban-toolkit/autk-core'] })],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'autk-compute',
    },
    copyPublicDir: false,
    emptyOutDir: !isWatch,
    sourcemap: true
  },
});
