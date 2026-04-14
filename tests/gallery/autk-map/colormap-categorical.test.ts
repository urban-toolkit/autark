import { test, expect } from '@playwright/test';

test('colormap-categorical', async ({ page }) => {
    await page.goto('/src/autk-map/colormap-categorical.html');
    await page.getByRole('img').click();
    await page.getByRole('button').nth(1).click();
    await expect(page.locator('canvas')).toHaveScreenshot('colormap-categorical.png');
});