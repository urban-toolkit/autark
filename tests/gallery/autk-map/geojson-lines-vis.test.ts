import { test, expect } from '@playwright/test';

test('geojson-lines-vis', async ({ page }) => {
    await page.goto('/src/autk-map/geojson-lines-vis.html');
    await page.waitForTimeout(5000);

    await expect(page.locator('canvas')).toHaveScreenshot('geojson-lines-vis.png');
});