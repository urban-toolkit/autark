/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: /\/\._/,
  snapshotPathTemplate: '{testFileDir}/{arg}{ext}',
  outputDir: './tests/results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: './tests/report' }]],
  use: {
    baseURL: 'http://localhost:5177',
    viewport: { width: 1280, height: 1280 },
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    // WebGPU requires Chromium with these flags
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,WebGPUService',
        '--use-angle=metal',
      ]
    }
  },

  // WebGPU is only supported in Chromium
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `cd ${process.env.APP ?? 'gallery'} && npm run dev -- --port 5177`,
    url: `http://localhost:5177${process.env.OPEN ?? '/'}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});


