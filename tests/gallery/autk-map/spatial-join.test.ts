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
    await page.waitForTimeout(5000);

    await expect(page.locator('canvas')).toHaveScreenshot('spatial-join.png');
});
