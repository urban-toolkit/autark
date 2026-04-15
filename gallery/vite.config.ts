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
  plugins: [pluginWatchNodeModules(['autk-core', 'autk-map', 'autk-db', 'autk-plot', 'autk-compute'])],
  optimizeDeps: {
    exclude: ['autk-core', 'autk-map', 'autk-db', 'autk-plot', 'autk-compute'],
  },

  server: {
    fs: {
      allow: ['..'],
    },
    // @ts-ignore
    open: process.env.PLAYWRIGHT ? false : (process.env.VITE_OPEN || '/src/autk-plot/table-click.html'),
    cors: {
      origin: '*',
      allowedHeaders: 'Range, Content-Type, Authorization',
      exposedHeaders: 'Content-Range',
    },
  },
});
