import { test, expect } from '@playwright/test';

test('compute-osm-function', async ({ page }) => {
    test.setTimeout(100000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.routeFromHAR('tests/data/compute-osm-function.har', { url: 'https://overpass-api.de/**', update: false });
    await page.goto('/src/autk-map/compute-osm-function.html');

    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await page.getByRole('img').click();
    await page.locator('div:nth-child(4) > button:nth-child(2)').click();
    await expect(page.locator('canvas')).toHaveScreenshot('compute-osm-function.png');
});
