import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.geojson': 'application/json',
  '.csv': 'text/csv',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

/**
 * Minimal static file server for tests.
 *
 * @param root Directory to serve files from.
 * @param cors When true, adds permissive CORS headers (mirrors cors_server.py).
 */
export function createStaticServer(root: string, { cors }: { cors: boolean }): http.Server {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const filePath = path.join(root, urlPath);
    // Prevent path traversal outside the served root.
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      res.writeHead(403).end();
      return;
    }
    if (cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(200).end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream');
      res.writeHead(200).end(data);
    });
  });
}

/** Starts a server and resolves once it is listening. */
export function listen(server: http.Server, port: number, host = '127.0.0.1'): Promise<void> {
  return new Promise<void>((resolve, reject) => server.listen(port, host, resolve).once('error', reject));
}

/** Closes a server, resolving once it has stopped. */
export function close(server: http.Server | undefined): Promise<void> {
  return new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
}
