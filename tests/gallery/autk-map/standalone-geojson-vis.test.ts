import { test, expect } from '@playwright/test';

test('standalone-geojson-vis', async ({ page }) => {
    await page.goto('/src/autk-map/standalone-geojson-vis.html');
    await page.locator('rect').nth(2).click();
    await page.getByRole('button').nth(2).click();
    await page.locator('canvas').dblclick({
        position: {
            x: 537,
            y: 390
        }
    });
    await expect(page.locator('canvas')).toHaveScreenshot('standalone-geojson-vis.png');      
});

