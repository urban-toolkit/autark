/* eslint-disable no-undef */

import { resolve } from 'path';
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [glsl(), dts()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'autk-grammar',
    },
    rollupOptions: {
      external: [
        'autk-db',
        'autk-map',
        'autk-plot',
        'autk-compute',
        'urban-grammar',
      ],
    },
    copyPublicDir: false,
    emptyOutDir: false,
    sourcemap: true
  },
});
