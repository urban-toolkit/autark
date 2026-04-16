import { test, expect } from '@playwright/test';

test('compute-function', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.goto('/src/autk-map/compute-function.html');
    await page.getByRole('img').click();
    await page.getByRole('button').nth(1).click();
    await expect(page.locator('canvas')).toHaveScreenshot('compute-function.png');
});