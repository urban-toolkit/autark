import { test, expect } from '@playwright/test';

test('geojson-boundaries-vis', async ({ page }) => {
    await page.goto('/src/autk-map/geojson-boundaries-vis.html');
    await page.waitForTimeout(5000);

    await expect(page.locator('canvas')).toHaveScreenshot('geojson-boundaries-vis.png');
});