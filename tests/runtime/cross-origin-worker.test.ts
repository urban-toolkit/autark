import * as http from 'http';
import * as path from 'path';
import { test, expect } from '@playwright/test';
import { createStaticServer, listen, close } from '../helpers/static-server';

/**
 * Regression test for cross-origin (Jupyter-like) embedding.
 *
 * A Jupyter notebook page (e.g. :8888) loads the runtime module, the DuckDB
 * worker, and data files from a separate dev server (e.g. :8000). Browsers
 * block `new Worker(url)` for cross-origin URLs even with CORS headers, so
 * the runtime must create its DuckDB worker via a same-origin blob: URL
 * (see autk-db/src/duckdb.ts).
 *
 * This test reproduces the scenario with two local origins:
 * - RUNTIME_PORT serves the repo root with CORS headers (like cors_server.py)
 * - PAGE_PORT serves the test page without CORS (like Jupyter)
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_PORT = 8901;
const PAGE_PORT = 8902;

let runtimeServer: http.Server;
let pageServer: http.Server;

test.beforeAll(async () => {
  runtimeServer = createStaticServer(REPO_ROOT, { cors: true });
  pageServer = createStaticServer(REPO_ROOT, { cors: false });
  await Promise.all([listen(runtimeServer, RUNTIME_PORT), listen(pageServer, PAGE_PORT)]);
});

test.afterAll(async () => {
  await Promise.all([close(runtimeServer), close(pageServer)]);
});

test.describe('Cross-origin runtime embedding (Jupyter scenario)', () => {
  test('DuckDB worker initializes and map renders when runtime is loaded cross-origin', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    const runtimeOrigin = `http://127.0.0.1:${RUNTIME_PORT}`;
    await page.goto(
      `http://127.0.0.1:${PAGE_PORT}/test-cross-origin.html?runtimeOrigin=${encodeURIComponent(runtimeOrigin)}`,
    );

    const status = page.locator('#status');
    await expect(status).not.toHaveAttribute('data-state', 'loading', { timeout: 60000 });

    const statusText = await status.textContent();
    expect(errors.filter((e) => e.includes('SecurityError')), 'no cross-origin Worker SecurityError').toEqual([]);
    expect(statusText, `status: ${statusText}\nconsole errors:\n${errors.join('\n')}`).toContain('SUCCESS');
    await expect(status).toHaveAttribute('data-state', 'success');
    expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(1);
  });
});
