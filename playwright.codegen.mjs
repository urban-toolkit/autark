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
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5177';
const outputFile = process.argv[3];

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

if (outputFile) {
    mkdirSync(dirname(outputFile), { recursive: true });
    // Use internal recorder API (same as `playwright codegen --output`) to auto-save generated code.
    await context._enableRecorder({ language: 'playwright-test', outputFile, startRecording: true });
} else {
    // Fallback: open Inspector UI without saving.
    const page = await context.newPage();
    await page.goto(url);
    await page.pause();
    await browser.close();
    process.exit(0);
}

const page = await context.newPage();
await page.goto(url);

// Wait for the browser to close (user finishes recording).
await new Promise(resolve => browser.on('disconnected', resolve));