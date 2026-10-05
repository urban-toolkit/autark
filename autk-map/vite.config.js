 

import { resolve } from 'path';
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import dts from 'vite-plugin-dts';

const isWatch = process.argv.includes('--watch');

export default defineConfig({
  resolve: {
    alias: {
      '@urban-toolkit/autk-core': resolve(import.meta.dirname, '../autk-core/src/index.ts'),
    },
  },
  plugins: [glsl(), dts()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'autk-map',
    },
    copyPublicDir: false,
    emptyOutDir: !isWatch,
    sourcemap: true
  },
});
