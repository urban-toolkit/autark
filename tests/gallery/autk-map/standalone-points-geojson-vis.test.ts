/**
 * Visual regression test for the standalone-points-geojson-vis gallery example.
 * Uses a fixed timeout because the canvas emits no console event on render completion.
 */
import { test, expect } from '@playwright/test';

test('standalone-points-geojson-vis', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.goto('/src/autk-map/standalone-points-geojson-vis.html');
    await page.waitForTimeout(5000); // canvas emits no sentinel; wait for GPU rendering to settle

    await expect(page.locator('canvas')).toHaveScreenshot('standalone-points-geojson-vis.png');
});
