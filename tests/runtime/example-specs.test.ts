import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const HARNESS_URL = '/tests/fixtures/runtime/runtime-test-harness.html';
const PYTHON = process.env.PYTHON ?? 'python';

test.describe('Runtime - Example Specs', () => {
  test('executes local spatial join example successfully', async ({ page }) => {
    page.on('console', msg => console.log(`Browser: [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.error(`Browser error: ${err.message}`));

    await page.goto(`${HARNESS_URL}?spec=/examples/specs/03-spatial-join.json`);

    await expect(page.locator('#status')).toHaveClass(/success/, { timeout: 30000 });
    await expect(page.locator('#metadata')).toContainText('Tables: neighborhoods, trees');
    await expect(page.locator('#metadata')).toContainText('Maps: neighborhood_map');
    await expect(page.locator('#metadata')).toContainText('Plots: tree_count_histogram');

    const joinedProperties = await page.evaluate(async () => {
      const runtime = window.__autarkRuntime;
      const db = runtime.getDb();
      const layer = await db.getLayer('neighborhoods');
      return layer.features.map(feature => feature.properties);
    });

    expect(joinedProperties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'West Square',
          sjoin: expect.objectContaining({
            count: expect.objectContaining({ trees: 2 }),
          }),
        }),
        expect.objectContaining({
          name: 'North Square',
          sjoin: expect.objectContaining({
            count: expect.objectContaining({ trees: 1 }),
          }),
        }),
        expect.objectContaining({
          name: 'East Square',
          sjoin: expect.objectContaining({
            count: expect.objectContaining({ trees: 1 }),
          }),
        }),
      ])
    );

    const highlightedIds = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      const plot = runtime.getPlot('tree_count_histogram');
      const map = runtime.getMap('neighborhood_map');
      const layer = map.layerManager.searchByLayerId('neighborhoods_layer');

      plot.setSelection([0, 2]);
      plot.events.emit('brushX', { selection: plot.selection });

      return layer.highlightedIds;
    });

    expect(highlightedIds).toEqual([0, 2]);

    const clearedIds = await page.evaluate(() => {
      const runtime = window.__autarkRuntime;
      const plot = runtime.getPlot('tree_count_histogram');
      const map = runtime.getMap('neighborhood_map');
      const layer = map.layerManager.searchByLayerId('neighborhoods_layer');

      plot.setSelection([]);
      plot.events.emit('brushX', { selection: [] });

      return layer.highlightedIds;
    });

    expect(clearedIds).toEqual([]);

    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('executes Python-generated spatial join spec successfully', async ({ page }) => {
    page.on('console', msg => console.log(`Browser: [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.error(`Browser error: ${err.message}`));

    const generatedSpec = execFileSync(PYTHON, ['python/examples/spatial_join.py'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: {
        ...process.env,
        PYTHONPATH: join(process.cwd(), 'python'),
      },
    });

    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/generated-specs/python-spatial-join.json') {
        return route.continue();
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: generatedSpec,
      });
    });

    await page.goto(`${HARNESS_URL}?spec=/generated-specs/python-spatial-join.json`);

    await expect(page.locator('#status')).toHaveClass(/success/, { timeout: 30000 });
    await expect(page.locator('#metadata')).toContainText('Tables: neighborhoods, trees');
    await expect(page.locator('#metadata')).toContainText('Maps: neighborhood_map');
    await expect(page.locator('#metadata')).toContainText('Plots: tree_count_histogram');

    const runtimeState = await page.evaluate(async () => {
      const runtime = window.__autarkRuntime;
      const db = runtime.getDb();
      const layer = await db.getLayer('neighborhoods');
      const plot = runtime.getPlot('tree_count_histogram');
      const map = runtime.getMap('neighborhood_map');
      const mapLayer = map.layerManager.searchByLayerId('neighborhoods_layer');

      plot.setSelection([0, 2]);
      plot.events.emit('brushX', { selection: plot.selection });

      return {
        joinedNames: layer.features.map(feature => feature.properties.name).sort(),
        highlightedIds: mapLayer.highlightedIds,
      };
    });

    expect(runtimeState.joinedNames).toEqual(['East Square', 'North Square', 'West Square']);
    expect(runtimeState.highlightedIds).toEqual([0, 2]);
    await expect(page.locator('canvas').first()).toBeVisible();
  });
});

declare global {
  interface Window {
    __autarkRuntime: any;
  }
}
