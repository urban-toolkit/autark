/**
 * Visual regression test for the camera-animation-vis gallery example.
 * Waits 10 s for the fly-to animation to reach a stable mid-flight frame before capturing.
 */
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

    await page.waitForTimeout(10000); // animation emits no completion event; wait for a stable frame

    await expect(page.locator('canvas')).toHaveScreenshot('camera-animation-vis.png');
});
