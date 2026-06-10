import * as fs from 'fs';
import * as path from 'path';
import { BrowserContext } from '@playwright/test';

const DUCKDB_DIST = path.resolve(__dirname, '..', '..', 'node_modules', '@duckdb', 'duckdb-wasm', 'dist');

/**
 * Serves jsDelivr DuckDB asset requests from the local @duckdb/duckdb-wasm
 * package so tests exercising the CDN fallback do not depend on the network.
 *
 * @param context Playwright browser context (covers worker-initiated requests).
 * @returns Array that accumulates the intercepted CDN request pathnames.
 */
export async function routeDuckdbCdnLocal(context: BrowserContext): Promise<string[]> {
  const cdnRequests: string[] = [];
  await context.route('https://cdn.jsdelivr.net/**', async (route) => {
    const url = new URL(route.request().url());
    cdnRequests.push(url.pathname);
    const fileName = path.basename(url.pathname);
    const filePath = path.join(DUCKDB_DIST, fileName);
    if (!fs.existsSync(filePath)) {
      await route.fulfill({ status: 404, body: `No local asset for ${fileName}` });
      return;
    }
    const contentType = fileName.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
    await route.fulfill({
      status: 200,
      contentType,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: fs.readFileSync(filePath),
    });
  });
  return cdnRequests;
}
