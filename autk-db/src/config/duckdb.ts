import * as duckdb from '@duckdb/duckdb-wasm';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: new URL(/* @vite-ignore */ './duckdb-mvp.wasm', import.meta.url).href,
    mainWorker: new URL(/* @vite-ignore */ './duckdb-browser-mvp.worker.js', import.meta.url).href,
  },
  eh: {
    mainModule: new URL(/* @vite-ignore */ './duckdb-eh.wasm', import.meta.url).href,
    mainWorker: new URL(/* @vite-ignore */ './duckdb-browser-eh.worker.js', import.meta.url).href,
  },
};

export async function loadDb() {
  // Select a bundle based on browser checks
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  // Instantiate the asynchronus version of DuckDB-wasm
  const worker = new Worker(bundle.mainWorker!);
  // Use VoidLogger to disable all DuckDB logging
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  return db;
}
