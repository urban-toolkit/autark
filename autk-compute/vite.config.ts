 

import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Keep the workspace alias out of the emitted declarations: published types must
// import the package, not a path into autk-core's source, which is not published.
const CORE_PACKAGE = '@urban-toolkit/autk-core';

export default defineConfig({
  resolve: {
    alias: {
      '@urban-toolkit/autk-core': resolve(__dirname, '../autk-core/src/index.ts'),
    },
  },
  plugins: [dts({ aliasesExclude: [CORE_PACKAGE] })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'autk-compute',
    },
    copyPublicDir: false,
    emptyOutDir: true,
    sourcemap: true
  },
});
