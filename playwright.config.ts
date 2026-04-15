/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: /\/\._/,
  snapshotPathTemplate: '{testDir}/{testFileDir}/{arg}{ext}',
  outputDir: './tests/results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { outputFolder: './tests/report' }]],
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
  webServer: {
    command: `cd ${process.env.APP ?? 'gallery'} && PLAYWRIGHT=1 npm run dev -- --port 5177`,
    url: 'http://localhost:5177/vite.svg',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

});


