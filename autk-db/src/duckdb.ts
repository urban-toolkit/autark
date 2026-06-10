import * as duckdb from '@duckdb/duckdb-wasm';

/**
 * Resolves the browser DuckDB-Wasm bundles for the current module location.
 *
 * When the module is served over HTTP(S) or from disk, the worker and wasm
 * assets emitted next to the bundle are used. When the module was loaded from
 * a blob:/data: URL (e.g. bundled into an anywidget ESM), relative asset URLs
 * cannot be resolved, so the official jsDelivr CDN bundles are used instead.
 */
function resolveBrowserBundles(): duckdb.DuckDBBundles {
  try {
    const base = import.meta.url;
    if (base.startsWith('http:') || base.startsWith('https:') || base.startsWith('file:')) {
      return {
        mvp: {
          mainModule: new URL(/* @vite-ignore */ './duckdb-mvp.wasm', base).href,
          mainWorker: new URL(/* @vite-ignore */ './duckdb-browser-mvp.worker.js', base).href,
        },
        eh: {
          mainModule: new URL(/* @vite-ignore */ './duckdb-eh.wasm', base).href,
          mainWorker: new URL(/* @vite-ignore */ './duckdb-browser-eh.worker.js', base).href,
        },
      };
    }
  } catch {
    // Fall through to CDN bundles.
  }
  return duckdb.getJsDelivrBundles();
}

const NODE_PATH_MODULE = 'node:path';
const NODE_WORKER_THREADS_MODULE = 'node:worker_threads';
const NODE_MODULE_MODULE = 'node:module';

/**
 * Loads and instantiates a DuckDB-Wasm database for the current runtime.
 *
 * Selects the Node.js worker bridge or browser bundle automatically so callers can create connections without handling environment-specific setup.
 *
 * @param None.
 * @returns An initialized `AsyncDuckDB` instance ready to open connections.
 * @throws If DuckDB assets cannot be resolved, the worker fails to start, or database instantiation fails.
 * @example
 * const db = await loadDb();
 * const conn = await db.connect();
 * console.log(typeof conn.query); // 'function'
 */
export async function loadDb() {
    if (typeof process !== 'undefined' && process.versions?.node) {
        const path = await import(/* @vite-ignore */ NODE_PATH_MODULE);
        const { Worker: NodeWorker } = await import(/* @vite-ignore */ NODE_WORKER_THREADS_MODULE);
        const { createRequire } = await import(/* @vite-ignore */ NODE_MODULE_MODULE);
        const require = createRequire(import.meta.url);
        const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm'));
        const workerPath = path.join(dist, 'duckdb-node-eh.worker.cjs');

        // Stub: polyfill the Web Worker globals the duckdb worker expects,
        // then require() it so it loads with proper CJS scope.
        const stub =
            `const { parentPort } = require('node:worker_threads');` +
            `globalThis.postMessage = (msg, transfer) => parentPort.postMessage(msg, transfer);` +
            `parentPort.on('message', (data) => { if (typeof globalThis.onmessage === 'function') globalThis.onmessage({ data }); });` +
            `require(${JSON.stringify(workerPath)});`;
        const nodeWorker = new NodeWorker(stub, { eval: true });

        const listeners = new Map<(event: any) => void, [string, (...args: any[]) => void]>();
        const adapter = {
            addEventListener(event: string, handler: (e: any) => void) {
                const wrapped =
                    event === 'error'
                        ? (err: any) =>
                              handler({
                                  error: err,
                                  message: err?.message ?? String(err),
                                  target: adapter,
                              })
                        : (data: any) => handler({ data, target: adapter });
                listeners.set(handler, [event, wrapped]);
                nodeWorker.on(event, wrapped);
            },
            removeEventListener(_event: string, handler: (e: any) => void) {
                const r = listeners.get(handler);
                if (r) {
                    nodeWorker.off(r[0], r[1]);
                    listeners.delete(handler);
                }
            },
            postMessage(data: any, transfer?: any[]) {
                nodeWorker.postMessage(data, transfer);
            },
            terminate() {
                return nodeWorker.terminate();
            },
        };

        const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), adapter as unknown as Worker);
        await db.instantiate(path.join(dist, 'duckdb-eh.wasm'));
        return db;
    }

    const bundle = await duckdb.selectBundle(resolveBrowserBundles());
    // Browsers block `new Worker(url)` when `url` is cross-origin, even with
    // CORS headers (e.g. runtime served from :8000 inside a Jupyter page on
    // :8888). Workaround recommended by the DuckDB-WASM docs: create the
    // worker from a same-origin blob: URL that importScripts() the real
    // worker script. Classic-worker importScripts() may load cross-origin
    // scripts, and the wasm module fetch still uses CORS as before.
    const workerBlobUrl = URL.createObjectURL(
        new Blob([`importScripts(${JSON.stringify(bundle.mainWorker!)});`], {
            type: 'text/javascript',
        }),
    );
    try {
        const worker = new Worker(workerBlobUrl);
        const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
        await db.instantiate(bundle.mainModule);
        return db;
    } finally {
        URL.revokeObjectURL(workerBlobUrl);
    }
}
