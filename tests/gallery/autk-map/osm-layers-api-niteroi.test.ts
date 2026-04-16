import { test, expect } from '@playwright/test';

test('osm-layers-api-niteroi', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    // TODO: record HAR with `update: true` once Overpass query is finalized
    await page.goto('/src/autk-map/osm-layers-api-niteroi.html');

    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await expect(page.locator('canvas')).toHaveScreenshot('osm-layers-api-niteroi.png');
});
