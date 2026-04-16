import { test, expect } from '@playwright/test';

test('geojson-lines-vis', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.goto('/src/autk-map/geojson-lines-vis.html');
    await page.waitForTimeout(5000);

    await expect(page.locator('canvas')).toHaveScreenshot('geojson-lines-vis.png');
});