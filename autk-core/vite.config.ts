import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const isWatch = process.argv.includes('--watch');

export default defineConfig({
  plugins: [dts()],
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
