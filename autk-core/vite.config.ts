import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { writeEsmDeclarationPaths } from '../.github/scripts/esm-declarations.mjs';

const isWatch = process.argv.includes('--watch');

export default defineConfig({
  plugins: [dts({ afterBuild: writeEsmDeclarationPaths })],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'autk-core',
    },
    copyPublicDir: false,
    emptyOutDir: !isWatch,
    sourcemap: true,
  },
});
