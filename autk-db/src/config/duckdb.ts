import * as duckdb from '@duckdb/duckdb-wasm';

const BROWSER_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: new URL(/* @vite-ignore */ './duckdb-mvp.wasm', import.meta.url).href,
    mainWorker: new URL(/* @vite-ignore */ './duckdb-browser-mvp.worker.js', import.meta.url).href,
  },
  eh: {
    mainModule: new URL(/* @vite-ignore */ './duckdb-eh.wasm', import.meta.url).href,
    mainWorker: new URL(/* @vite-ignore */ './duckdb-browser-eh.worker.js', import.meta.url).href,
  },
};

/**
 * Loads and instantiates a DuckDB database, with Node.js and browser support.
 *
 * @returns An instantiated `AsyncDuckDB` instance ready for connections.
 * @throws If DuckDB WebAssembly fails to load or instantiate.
 */
export async function loadDb() {
    if (typeof process !== 'undefined' && process.versions?.node) {
        const path = await import(/* @vite-ignore */ 'node:path');
        const { Worker: NodeWorker } = await import(/* @vite-ignore */ 'node:worker_threads');
        const { createRequire } = await import(/* @vite-ignore */ 'node:module');
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

        const listeners = new Map<Function, [string, (...args: any[]) => void]>();
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

    const bundle = await duckdb.selectBundle(BROWSER_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(bundle.mainModule);
    return db;
}
