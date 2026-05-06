import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const externalPackages = ['autk-map', 'autk-db', 'autk-compute', 'autk-plot', 'autk-provenance'];

export default defineConfig({
  plugins: [dts()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        map: resolve(__dirname, 'src/map.ts'),
        db: resolve(__dirname, 'src/db.ts'),
        compute: resolve(__dirname, 'src/compute.ts'),
        plot: resolve(__dirname, 'src/plot.ts'),
        provenance: resolve(__dirname, 'src/provenance.ts'),
      },
      formats: ['es'],
    },
    copyPublicDir: false,
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: externalPackages,
    },
  },
});
