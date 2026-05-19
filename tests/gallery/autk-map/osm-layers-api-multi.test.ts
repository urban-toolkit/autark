/**
 * Visual regression test for the osm-layers-api-multi gallery example.
 * Overpass API responses are replayed from a local HAR file; captures both
 * map instances (#map01, #map02) separately. Run
 * `make test-update cache APP=gallery OPEN=/src/autk-map/osm-layers-api-multi.html` to re-record.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { routeOverpassHar } from '../../helpers/route-overpass-har';

test('osm-layers-api-multi', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await routeOverpassHar(page, path.join(__dirname, '../../data/osm-layers-api-multi.har'), false);
    await page.goto('/src/autk-map/osm-layers-api-multi.html');

    // Sentinel emitted by autk-db when the first OSM layer begins loading.
    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await expect(page.locator('#map01')).toHaveScreenshot('osm-layers-api-multi-01.png');
    await expect(page.locator('#map02')).toHaveScreenshot('osm-layers-api-multi-02.png');
});
