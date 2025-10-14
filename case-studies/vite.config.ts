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
  plugins: [pluginWatchNodeModules(['autk-map', 'autk-db', 'autk-plot', 'autk-compute'])],
  optimizeDeps: {
    exclude: ['autk-map', 'autk-db', 'autk-plot', 'autk-compute'],
  },
  build: {
    rollupOptions: {
      input: {
        nested: '/src/autk-db/',
        nested2: '/src/autk-map/',
        nested3: '/src/autk-plot/',
        nested4: '/src/autk-compute/',
      },
    },
  },
  server: {
    open: '/src/autk-map/compute-osm-function.html',
    cors: {
      origin: '*',
      allowedHeaders: 'Range, Content-Type, Authorization',
      exposedHeaders: 'Content-Range',
    },
  },
});
