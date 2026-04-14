import { test, expect } from '@playwright/test';

test('compute-osm-function', async ({ page }) => {
    test.setTimeout(1200000);
    await page.goto('/src/autk-map/compute-osm-function.html');

    // Aguarda o evento de console com um timeout de 60 segundos
    const waitForConsoleMessage = page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('Loading layer: table_osm_roads of type roads')
    });

    // 3. O teste para aqui até que o console receba a mensagem
    await waitForConsoleMessage;

    await page.locator('canvas').click({
        position: {
            x: 631,
            y: 361
        }
    });
    await page.mouse.wheel(0, 50);

    await page.getByRole('img').click();
    await page.locator('div:nth-child(4) > button:nth-child(2)').click();
    await expect(page.locator('canvas')).toHaveScreenshot('compute-osm-function.png');
});
