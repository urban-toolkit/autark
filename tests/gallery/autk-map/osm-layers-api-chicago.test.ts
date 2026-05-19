/**
 * Visual regression test for the osm-layers-api-chicago gallery example.
 * Overpass API responses are replayed from a local HAR file; run
 * `make test-update cache APP=gallery OPEN=/src/autk-map/osm-layers-api-chicago.html` to re-record.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { routeOverpassHar } from '../../helpers/route-overpass-har';

test('osm-layers-api-chicago', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await routeOverpassHar(page, path.join(__dirname, '../../data/osm-layers-api-chicago.har'), false);
    await page.goto('/src/autk-map/osm-layers-api-chicago.html');

    // Sentinel emitted by autk-db when the first OSM layer begins loading.
    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await expect(page.locator('canvas')).toHaveScreenshot('osm-layers-api-chicago.png');
});
