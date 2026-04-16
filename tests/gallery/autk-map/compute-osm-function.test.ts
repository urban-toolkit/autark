import { test, expect } from '@playwright/test';
import * as path from 'path';
import { routeOverpassHar } from '../../helpers/route-overpass-har';

test('compute-osm-function', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

    await routeOverpassHar(page, path.join(__dirname, '../../data/compute-osm-function.har'), false);
    await page.goto('/src/autk-map/compute-osm-function.html');

    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await page.getByRole('img').click();
    await page.locator('div:nth-child(4) > button:nth-child(2)').click();
    await expect(page.locator('canvas')).toHaveScreenshot('compute-osm-function.png');
});
