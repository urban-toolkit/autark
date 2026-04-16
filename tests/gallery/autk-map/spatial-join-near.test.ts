/**
 * Visual regression test for the spatial-join-near gallery example.
 * Overpass API responses are replayed from a local HAR file; an extra fixed
 * timeout allows the proximity-based join computation to settle before capture. Run
 * `make test-update cache APP=gallery OPEN=/src/autk-map/spatial-join-near.html` to re-record.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { routeOverpassHar } from '../../helpers/route-overpass-har';

test('spatial-join-near', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await routeOverpassHar(page, path.join(__dirname, '../../data/spatial-join-near.har'), false);
    await page.goto('/src/autk-map/spatial-join-near.html');

    // Sentinel emitted by autk-db when the first OSM layer begins loading.
    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });
    await page.waitForTimeout(5000); // proximity join runs asynchronously after layers load

    await expect(page.locator('canvas')).toHaveScreenshot('spatial-join-near.png');
});
