// Quick check: load test-cross-origin.html from :8001 (runtime on :8000)
// and report whether the DuckDB worker initializes despite cross-origin.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,WebGPUService',
    '--use-angle=metal',
  ],
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

await page.goto('http://localhost:8001/test-cross-origin.html');
await page.waitForFunction(
  () => document.getElementById('status')?.dataset.state !== 'loading',
  { timeout: 60000 },
);
const state = await page.evaluate(() => document.getElementById('status').dataset.state);
const text = await page.evaluate(() => document.getElementById('status').textContent);
console.log('STATE:', state);
console.log('TEXT:', text);
if (consoleErrors.length) {
  console.log('CONSOLE ERRORS:');
  for (const e of consoleErrors) console.log('  -', e);
}
await browser.close();
process.exit(state === 'success' ? 0 : 1);
