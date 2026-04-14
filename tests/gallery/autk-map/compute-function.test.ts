import { test, expect } from '@playwright/test';

test('compute-function', async ({ page }) => {
    await page.goto('/src/autk-map/compute-function.html');
    await page.getByRole('img').click();
    await page.getByRole('button').nth(1).click();
    await expect(page.locator('canvas')).toHaveScreenshot('compute-function.png');
});