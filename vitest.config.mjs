import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Test workspace packages against autk-core's source, so tests do not depend on a prior build.
      '@urban-toolkit/autk-core': fileURLToPath(new URL('./autk-core/src/index.ts', import.meta.url)),
    },
  },
});
