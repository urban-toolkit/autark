import { test, expect } from '@playwright/test';

test('spatial-join-multi', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    // TODO: record HAR with `update: true` once Overpass query is finalized
    await page.goto('/src/autk-map/spatial-join-multi.html');

    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await expect(page.locator('canvas')).toHaveScreenshot('spatial-join-multi.png');
});
