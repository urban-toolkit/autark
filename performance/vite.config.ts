import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
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

/**
 * Exposes POST /api/save so the benchmark page can persist files to
 * public/data/ on the local dev server filesystem rather than triggering
 * browser download dialogs.
 *
 * Request body JSON:  { filename: string, content: string, encoding?: 'utf-8' | 'base64' }
 * Response JSON:      { ok: true }
 */
export function pluginSaveToPublic() {
  return {
    name: 'save-to-public',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        '/api/save',
        (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const { filename, content, encoding = 'utf-8' } = JSON.parse(body) as {
                filename: string;
                content: string;
                encoding?: 'utf-8' | 'base64';
              };

              const dataDir = path.join(process.cwd(), 'public', 'data');
              fs.mkdirSync(dataDir, { recursive: true });

              const filePath = path.join(dataDir, path.basename(filename));
              if (encoding === 'base64') {
                fs.writeFileSync(filePath, Buffer.from(content, 'base64'));
              } else {
                fs.writeFileSync(filePath, content, 'utf-8');
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
            }
          });
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [
    pluginWatchNodeModules(['autk-map', 'autk-db', 'autk-plot', 'autk-compute']),
    pluginSaveToPublic(),
  ],
  optimizeDeps: {
    exclude: ['autk-map', 'autk-db', 'autk-plot', 'autk-compute'],
  },

  server: {
    fs: { allow: ['..'] },
    // @ts-ignore
    open: process.env.VITE_OPEN || '/src/loading-benchmark.html',
    cors: {
      origin: '*',
      allowedHeaders: 'Range, Content-Type, Authorization',
      exposedHeaders: 'Content-Range',
    },
  },
});
