/**
 * Visual regression test for the heatmap-vis gallery example.
 * Overpass API responses are replayed from a local HAR file; run
 * `make test-update cache APP=gallery OPEN=/src/autk-map/heatmap-vis.html` to re-record.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { routeOverpassHar } from '../../helpers/route-overpass-har';

test('heatmap-vis', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await routeOverpassHar(page, path.join(__dirname, '../../data/heatmap-vis.har'), false);
    await page.goto('/src/autk-map/heatmap-vis.html');

    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await expect(page.locator('canvas')).toHaveScreenshot('heatmap-vis.png');
});
