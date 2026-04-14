import { test, expect } from '@playwright/test';

test('test camera animation', async ({ page }) => {
    await page.goto('/src/autk-map/camera-animation-vis.html');

    await page.waitForTimeout(10000);

    await expect(page.locator('canvas')).toHaveScreenshot('camera-animation-vis.png');
});
