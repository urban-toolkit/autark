import { test, expect } from '@playwright/test';

test('geojson-vis', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.goto('/src/autk-map/standalone-geojson-vis.html');
    await page.locator('rect').nth(2).click();
    await page.getByRole('button').nth(2).click();
    await page.locator('canvas').dblclick({
        position: {
            x: 537,
            y: 390
        }
    });
    await expect(page.locator('canvas')).toHaveScreenshot('geojson-vis.png');      
});

