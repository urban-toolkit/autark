/**
 * Browser-based runtime tests using local fixtures (no network calls).
 * These tests verify that the runtime can:
 * - Load and parse spec JSON
 * - Initialize the database
 * - Load local GeoJSON and CSV files
 * - Render maps and plots
 * - Expose correct metadata APIs
 */
import { test, expect } from '@playwright/test';

const HARNESS_URL = '/tests/fixtures/runtime/runtime-test-harness.html';

test.describe('Runtime - Local Fixtures (CI-safe)', () => {
  test('loads GeoJSON map spec successfully', async ({ page }) => {
    page.on('console', msg => console.log(`Browser: [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.error(`Browser error: ${err.message}`));

    await page.goto(`${HARNESS_URL}?spec=/tests/fixtures/runtime/fixture-01-geojson-map.json`);

    // Wait for success status
    await expect(page.locator('#status')).toHaveClass(/success/, { timeout: 30000 });
    await expect(page.locator('#status')).toContainText('Runtime loaded successfully');

    // Verify runtime is exposed
    const hasRuntime = await page.evaluate(() => window.__autarkRuntime !== undefined);
    expect(hasRuntime).toBe(true);

    // Verify database has correct table
    const tables = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      const db = runtime.getDb();
      return db.getTablesMetadata().map(t => ({ name: t.name, type: t.type }));
    });

    expect(tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'manhattan', type: 'polygons' })
      ])
    );

    // Verify map was created
    const maps = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      return runtime.getMaps().map(m => m.name);
    });

    expect(maps).toContain('manhattan_map');

    // Verify canvas is visible and non-blank
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Wait for rendering
    await page.waitForTimeout(2000);

    // Check rendered pixels via a screenshot. WebGPU canvases cannot be
    // reliably read through a 2D context after the GPU context is created.
    const screenshot = await canvas.screenshot();
    const hasContent = await page.evaluate(async (bytes) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      );
      const surface = new OffscreenCanvas(image.width, image.height);
      const ctx = surface.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, image.width, image.height);
      const [baseR, baseG, baseB, baseA] = imageData.data;

      // A blank canvas screenshot is a flat color. Rendered content should
      // introduce at least some pixels that differ from the background.
      for (let i = 4; i < imageData.data.length; i += 4) {
        const colorDelta =
          Math.abs(imageData.data[i] - baseR) +
          Math.abs(imageData.data[i + 1] - baseG) +
          Math.abs(imageData.data[i + 2] - baseB) +
          Math.abs(imageData.data[i + 3] - baseA);
        if (colorDelta > 10) return true;
      }
      return false;
    }, [...screenshot]);

    expect(hasContent).toBe(true);

    // Verify no console errors
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

  test('loads CSV with histogram spec successfully', async ({ page }) => {
    page.on('console', msg => console.log(`Browser: [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.error(`Browser error: ${err.message}`));

    await page.goto(`${HARNESS_URL}?spec=/tests/fixtures/runtime/fixture-02-csv-histogram.json`);

    // Wait for success status
    await expect(page.locator('#status')).toHaveClass(/success/, { timeout: 30000 });

    // Verify table was loaded from CSV
    const tables = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      const db = runtime.getDb();
      return db.getTablesMetadata().map(t => ({ name: t.name, source: t.source }));
    });

    expect(tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'points', source: 'csv' })
      ])
    );

    // Verify both map and plot were created
    const viewCounts = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      return {
        maps: runtime.getMaps().length,
        plots: runtime.getPlots().length
      };
    });

    expect(viewCounts.maps).toBe(1);
    expect(viewCounts.plots).toBe(1);

    // Verify metadata display shows correct counts
    await expect(page.locator('#metadata')).toContainText('Table count: 1');
    await expect(page.locator('#metadata')).toContainText('Maps: points_map');
    await expect(page.locator('#metadata')).toContainText('Plots: value_histogram');

    // Verify canvas exists
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('exposes correct runtime metadata APIs', async ({ page }) => {
    page.on('console', msg => console.log(`Browser: [${msg.type()}] ${msg.text()}`));

    await page.goto(`${HARNESS_URL}?spec=/tests/fixtures/runtime/fixture-01-geojson-map.json`);
    await expect(page.locator('#status')).toHaveClass(/success/, { timeout: 30000 });

    // Test getDb().getTablesMetadata()
    const hasGetTablesMetadata = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      const db = runtime.getDb();
      return typeof db.getTablesMetadata === 'function';
    });
    expect(hasGetTablesMetadata).toBe(true);

    // Test getMaps() returns array
    const mapsIsArray = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      return Array.isArray(runtime.getMaps());
    });
    expect(mapsIsArray).toBe(true);

    // Test getPlots() returns array
    const plotsIsArray = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      return Array.isArray(runtime.getPlots());
    });
    expect(plotsIsArray).toBe(true);
  });
});

// Declare window extensions for TypeScript
declare global {
  interface Window {
    __autarkRuntime: any;
    __autarkSpec: any;
  }
}
