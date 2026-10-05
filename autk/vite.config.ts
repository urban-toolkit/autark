import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const isWatch = process.argv.includes('--watch');

const externalPackages = [
  '@urban-toolkit/autk-core',
  '@urban-toolkit/autk-map',
  '@urban-toolkit/autk-db',
  '@urban-toolkit/autk-compute',
  '@urban-toolkit/autk-plot',
];

export default defineConfig({
  plugins: [dts()],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        core: resolve(import.meta.dirname, 'src/core.ts'),
        map: resolve(import.meta.dirname, 'src/map.ts'),
        db: resolve(import.meta.dirname, 'src/db.ts'),
        compute: resolve(import.meta.dirname, 'src/compute.ts'),
        plot: resolve(import.meta.dirname, 'src/plot.ts'),
      },
      formats: ['es'],
    },
    copyPublicDir: false,
    emptyOutDir: !isWatch,
    sourcemap: true,
    rollupOptions: {
      external: externalPackages,
    },
  },
});
