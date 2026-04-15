import { test, expect } from '@playwright/test';
import * as path from 'path';

test('layer-opacity', async ({ page }) => {
    test.setTimeout(1000000);

    page.on('console', msg => {
        console.log(`Browser log: [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`Browser error: ${err.message}`);
    });

   
    console.log('Setting up HAR route for Overpass API requests...');
    console.log(`HAR file path: ${path.join(__dirname, '../../data/layer-opacity.har')}`); 

    await page.routeFromHAR(path.join(__dirname, '../../data/layer-opacity.har'), { url: 'https://overpass-api.de/**', update: true });
    await page.goto('/src/autk-map/layer-opacity.html');

    await page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    await expect(page.locator('canvas')).toHaveScreenshot('layer-opacity.png');
});
