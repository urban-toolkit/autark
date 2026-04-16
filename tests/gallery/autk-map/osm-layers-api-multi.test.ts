import { test, expect } from '@playwright/test';

test('osm-layers-api-multi', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.goto('/src/autk-map/osm-layers-api-multi.html');

    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await expect(page.locator('#map01')).toHaveScreenshot('osm-layers-api-multi-01.png');
    await expect(page.locator('#map02')).toHaveScreenshot('osm-layers-api-multi-02.png');
});
