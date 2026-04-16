import { test, expect } from '@playwright/test';

test('camera-animation-vis', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.goto('/src/autk-map/camera-animation-vis.html');

    await page.waitForTimeout(10000);

    await expect(page.locator('canvas')).toHaveScreenshot('camera-animation-vis.png');
});
