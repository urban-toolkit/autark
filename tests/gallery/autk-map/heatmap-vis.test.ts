import { test, expect } from '@playwright/test';

test('heatmap-vis', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await page.routeFromHAR('tests/data/heatmap-vis.har', { url: 'https://overpass-api.de/**', update: false });
    await page.goto('/src/autk-map/heatmap-vis.html');

    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await expect(page.locator('canvas')).toHaveScreenshot('heatmap-vis.png');
});
