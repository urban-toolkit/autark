import { fileURLToPath } from 'node:url';
import { type ViteDevServer, defineConfig } from 'vite';

export function pluginWatchNodeModules(modules: string[]) {
  const pattern = `/node_modules\\/(?!${modules.join('|')}).*/`;
  return {
    name: 'watch-node-modules',
    configureServer: (server: ViteDevServer): void => {
      server.watcher.options = {
        ...server.watcher.options,
        ignored: [new RegExp(pattern), '**/.git/**'],
      };
    },
  };
}

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{
            name: 'dependencies',
            test: /[\\/](?:node_modules|dist)[\\/]/,
            maxSize: 350_000,
            entriesAware: true,
          }],
        },
      },
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        niteroi: fileURLToPath(new URL('./src/niteroi/main.html', import.meta.url)),
        shadows: fileURLToPath(new URL('./src/shadows/main.html', import.meta.url)),
        urbane: fileURLToPath(new URL('./src/urbane/main.html', import.meta.url)),
      },
    },
  },
  plugins: [
    pluginWatchNodeModules([
      '@urban-toolkit/autk-core',
      '@urban-toolkit/autk-map',
      '@urban-toolkit/autk-db',
      '@urban-toolkit/autk-plot',
      '@urban-toolkit/autk-compute',
    ]),
  ],
  optimizeDeps: {
    exclude: [
      '@urban-toolkit/autk-core',
      '@urban-toolkit/autk-map',
      '@urban-toolkit/autk-db',
      '@urban-toolkit/autk-plot',
      '@urban-toolkit/autk-compute',
    ],
  },

  server: {
    fs: {
      allow: ['..'],
    },
    open: process.env.PLAYWRIGHT ? false : '/',
    cors: {
      origin: '*',
      allowedHeaders: 'Range, Content-Type, Authorization',
      exposedHeaders: 'Content-Range',
    },
  },
});
