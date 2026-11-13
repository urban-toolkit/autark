import { ViteDevServer, defineConfig } from 'vite';

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
    // Discover DuckDB before navigation so the first data-backed example does
    // not trigger dependency re-optimization and replace the inspected page.
    include: ['@duckdb/duckdb-wasm'],
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
