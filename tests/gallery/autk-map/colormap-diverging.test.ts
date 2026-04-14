import { test, expect } from '@playwright/test';

test('colormap-diverging', async ({ page }) => {
    await page.goto('/src/autk-map/colormap-diverging.html');
    await page.getByRole('img').click();
    await page.getByRole('button').nth(1).click();
    await expect(page.locator('canvas')).toHaveScreenshot('colormap-diverging.png');
});