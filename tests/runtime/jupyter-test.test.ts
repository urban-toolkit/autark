import * as http from 'http';
import * as path from 'path';
import { test, expect } from '@playwright/test';
import { createStaticServer, listen, close } from '../helpers/static-server';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8765;

let server: http.Server;

test.beforeAll(async () => {
  server = createStaticServer(REPO_ROOT, { cors: false });
  await listen(server, PORT);
});

test.afterAll(async () => {
  await close(server);
});

test.describe('Jupyter Integration Test', () => {
  test('Python-generated HTML renders correctly', async ({ page }) => {
    // Set up console listeners BEFORE navigation
    const errors: string[] = [];
    const allLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      allLogs.push(`[${msg.type()}] ${text}`);
      if (msg.type() === 'error') {
        errors.push(text);
      }
      console.log(`Browser [${msg.type()}]:`, text);
    });

    page.on('pageerror', error => {
      console.log('Page Error:', error.message);
      errors.push(error.message);
    });

    // Navigate to the test HTML served via HTTP
    await page.goto('http://127.0.0.1:8765/test-jupyter.html');

    // Wait for both tests to complete
    await page.waitForTimeout(8000);

    // Check status for test 1
    const status1 = await page.locator('#status1').textContent();
    console.log('Test 1 Status:', status1);

    // Wait a bit more for rendering
    await page.waitForTimeout(3000);

    // Check if there's a canvas (map should create one)
    const canvas = page.locator('canvas');
    const canvasCount = await canvas.count();
    console.log('Canvas elements found:', canvasCount);

    // Get final status for both tests
    const finalStatus1 = await page.locator('#status1').textContent();
    const statusClass1 = await page.locator('#status1').getAttribute('class');
    const finalStatus2 = await page.locator('#status2').textContent();
    const statusClass2 = await page.locator('#status2').getAttribute('class');

    console.log('Test 1 Final status:', finalStatus1);
    console.log('Test 1 Status class:', statusClass1);
    console.log('Test 2 Final status:', finalStatus2);
    console.log('Test 2 Status class:', statusClass2);
    console.log('Errors:', errors);

    // Assertions
    expect(statusClass1).toContain('success');
    expect(statusClass2).toContain('success');
    expect(canvasCount).toBeGreaterThanOrEqual(2); // Both tests should create canvases
    // Note: errors array may have warnings, just check no critical failures
    expect(finalStatus1).toContain('Success');
    expect(finalStatus2).toContain('Success');
  });
});
