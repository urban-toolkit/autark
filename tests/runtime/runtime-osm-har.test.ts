/**
 * Runtime tests for OSM-based specs using HAR fixtures.
 * These tests use recorded Overpass API responses for repeatability.
 *
 * To re-record HAR files, run with HAR_UPDATE=1 environment variable.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { routeOverpassHar } from '../helpers/route-overpass-har';

const HARNESS_URL = '/tests/fixtures/runtime/runtime-test-harness.html';

test.describe('Runtime - OSM with HAR (CI-safe)', () => {
  test('loads basic OSM map spec with HAR', async ({ page }) => {
    test.setTimeout(60000);

    page.on('console', msg => console.log(`Browser: [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.error(`Browser error: ${err.message}`));

    // Route Overpass calls through HAR
    await routeOverpassHar(
      page,
      path.join(__dirname, '../data/osm-layers-api.har'),
      false
    );

    await page.goto(`${HARNESS_URL}?spec=/tests/fixtures/runtime/fixture-03-osm-har.json`);

    // Wait for runtime to load
    await expect(page.locator('#status')).toHaveClass(/success/, { timeout: 60000 });

    // Verify OSM tables were created
    const tables = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      const db = runtime.getDb();
      return db.getTablesMetadata().map(t => t.name);
    });

    // OSM layers should be named as ${name}_${layer}
    expect(tables).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/_buildings$/),
        expect.stringMatching(/_roads$/)
      ])
    );

    // Verify map was created
    const maps = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      return runtime.getMaps().map(m => m.name);
    });

    expect(maps.length).toBeGreaterThan(0);

    // Verify canvas rendered
    await page.waitForTimeout(2000);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });
});

test.describe('Runtime - OSM with Real Network (Manual)', () => {
  test.skip(process.env['RUN_REAL_OVERPASS'] !== '1', 'Set RUN_REAL_OVERPASS=1 to run the live Overpass test');

  test('loads basic OSM map spec with real Overpass API', async ({ page }) => {
    // This test requires network access and is NOT CI-safe
    // Run manually to verify real Overpass integration
    test.setTimeout(120000);

    page.on('console', msg => console.log(`Browser: [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.error(`Browser error: ${err.message}`));

    await page.goto(`${HARNESS_URL}?spec=/tests/fixtures/runtime/fixture-04-osm-live.json`);

    // Wait for runtime to load (may take longer with real network)
    await expect(page.locator('#status')).toHaveClass(/success/, { timeout: 120000 });

    // Verify tables were created
    const tableCount = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      const db = runtime.getDb();
      return db.getTablesMetadata().length;
    });

    expect(tableCount).toBeGreaterThan(0);
  });
});

// Declare window extensions for TypeScript
declare global {
  interface Window {
    __autarkRuntime: any;
    __autarkSpec: any;
  }
}
