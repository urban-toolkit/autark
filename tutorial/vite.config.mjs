import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const modules = [
  '@urban-toolkit/autk',
  '@urban-toolkit/autk-core',
  '@urban-toolkit/autk-map',
  '@urban-toolkit/autk-db',
  '@urban-toolkit/autk-plot',
  '@urban-toolkit/autk-compute',
];

// Resolve and watch workspace builds just like gallery and usecases, without a new workspace.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: 'node_modules/.vite',
  plugins: [{
    name: 'watch-workspace-packages',
    configureServer(server) {
      server.watcher.options = {
        ...server.watcher.options,
        ignored: [new RegExp(`/node_modules\\/(?!${modules.join('|')}).*/`), '**/.git/**'],
      };
    },
  }],
  optimizeDeps: { exclude: modules },
  server: {
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    open: process.env.PLAYWRIGHT ? false : '/',
  },
});
