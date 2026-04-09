/**
 * Playwright codegen launcher with WebGPU support.
 *
 * `playwright codegen` does not accept --config, so custom browser launch
 * args cannot be passed through the CLI. This script launches Chromium with
 * the required WebGPU flags and calls page.pause(), which opens the full
 * Playwright Inspector (including the code recorder) inside that browser.
 *
 * Usage:
 *   node scripts/codegen.mjs [url]
 *   node scripts/codegen.mjs http://localhost:5173/gallery/geojson-vis/
 */

import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5173';

const browser = await chromium.launch({
    headless: false,
    args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,WebGPUService',
        '--use-angle=metal',
    ],
});

const context = await browser.newContext({
    viewport: { width: 1280, height: 1280 },
});

const page = await context.newPage();
await page.goto(url);

// Opens the Playwright Inspector with the code recorder UI.
await page.pause();

await browser.close();