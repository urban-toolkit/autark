import { resolve } from 'path';
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

/**
 * Builds the anywidget ESM bundle shipped inside the Python package.
 *
 * Differences from the main runtime build (vite.config.js):
 * - Single self-contained file (dynamic imports inlined) because anywidget
 *   loads the module from a blob:/data: URL where relative chunk imports and
 *   asset URLs cannot resolve.
 * - No DuckDB worker/wasm assets are emitted: autk-db falls back to the
 *   jsDelivr CDN bundles when the module origin is not http(s).
 * - Output goes to python/autark/static/ so it is packaged with the wheel.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@autark-schema': resolve(__dirname, '../schema/autark-spec-v0.1.json'),
      '@urban-toolkit/autk-core': resolve(__dirname, '../autk-core/src/index.ts'),
      '@urban-toolkit/autk-db': resolve(__dirname, '../autk-db/src/index.ts'),
      '@urban-toolkit/autk-compute': resolve(__dirname, '../autk-compute/src/index.ts'),
      '@urban-toolkit/autk-map': resolve(__dirname, '../autk-map/src/index.ts'),
      '@urban-toolkit/autk-plot': resolve(__dirname, '../autk-plot/src/index.ts'),
    },
  },
  plugins: [glsl()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/widget.ts'),
      fileName: () => 'autark-widget.js',
      formats: ['es'],
    },
    outDir: resolve(__dirname, '../python/autark/static'),
    copyPublicDir: false,
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
