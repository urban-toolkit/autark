import { defineConfig, devices } from '@playwright/test';

const GALLERY_PORT = 6173;
const USECASES_PORT = 6174;

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: 'off',
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--enable-features=WebGPU',
        '--use-angle=metal',
        '--use-gl=angle',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: [
    {
      command: `npx vite --port ${GALLERY_PORT} --strictPort`,
      cwd: '../gallery',
      port: GALLERY_PORT,
      reuseExistingServer: false,
      env: { PLAYWRIGHT: 'true' },
      timeout: 30000,
    },
    {
      command: `npx vite --port ${USECASES_PORT} --strictPort`,
      cwd: '../usecases',
      port: USECASES_PORT,
      reuseExistingServer: false,
      env: { PLAYWRIGHT: 'true' },
      timeout: 30000,
    },
  ],
  projects: [
    {
      name: 'chromium-webgpu',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
