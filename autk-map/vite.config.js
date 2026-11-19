 

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
  plugins: [
    glsl(),
    // Published declarations must reference the core package, not its workspace source.
    dts({ aliasesExclude: ['@urban-toolkit/autk-core'] }),
    {
      name: 'split-map-es-dependencies',
      outputOptions(options) {
        // Only split the ES build; the UMD entry remains self-contained.
        if (options.format !== 'es') return null;
        return {
          ...options,
          // Proj4 registers projections during module initialization.
          strictExecutionOrder: true,
          codeSplitting: {
            groups: [{ name: 'map-vendor', test: /[\\/]node_modules[\\/]/, maxSize: 180_000 }],
          },
        };
      },
    },
  ],
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
