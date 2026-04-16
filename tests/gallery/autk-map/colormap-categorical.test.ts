/**
 * Visual regression test for the colormap-categorical gallery example.
 * Opens the colormap picker and advances to the second palette before capturing.
 */
import { test, expect } from '@playwright/test';

test('colormap-categorical', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.goto('/src/autk-map/colormap-categorical.html');
    await page.getByRole('img').click();
    await page.getByRole('button').nth(1).click();
    await expect(page.locator('canvas')).toHaveScreenshot('colormap-categorical.png');
});