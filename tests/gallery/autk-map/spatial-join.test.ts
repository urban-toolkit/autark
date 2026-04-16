/**
 * Visual regression test for the spatial-join gallery example.
 * Uses a fixed timeout because the canvas emits no console event on render completion.
 */
import { test, expect } from '@playwright/test';

test('spatial-join', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.goto('/src/autk-map/spatial-join.html');
    await page.waitForTimeout(5000); // canvas emits no sentinel; wait for GPU rendering to settle

    await expect(page.locator('canvas')).toHaveScreenshot('spatial-join.png');
});
