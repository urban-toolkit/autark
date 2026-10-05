import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  resolve: {
    alias: {
      '@urban-toolkit/autk-core': fileURLToPath(new URL('./autk-core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['autk*/test/**/*.test.ts'],
  },
});
