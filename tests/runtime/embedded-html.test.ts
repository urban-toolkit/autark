import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { test, expect } from '@playwright/test';
import { createStaticServer, listen, close } from '../helpers/static-server';
import { routeDuckdbCdnLocal } from '../helpers/route-duckdb-cdn';

/**
 * Regression test for self-contained HTML export (Spec.save_html()).
 *
 * The exported document embeds the widget runtime bundle inline and loads it
 * via a blob: URL, so it must work without any local server. The file is
 * generated through the real Python code path and opened over plain http;
 * jsDelivr DuckDB requests are served locally so the test is hermetic.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'tests', 'results');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'embedded-export.html');
const PORT = 8904;

const GENERATE_SCRIPT = `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(REPO_ROOT, 'python'))})
import autark as ak

inline = ak.GeoJSON(
    "inline_polys",
    values={
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "a"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-74.01, 40.70], [-74.00, 40.70],
                        [-74.00, 40.71], [-74.01, 40.71],
                        [-74.01, 40.70],
                    ]],
                },
            }
        ],
    },
    coordinate_format="EPSG:4326",
    layer_type="polygons",
)

spec = ak.Spec(
    metadata=ak.Metadata(title="Embedded export test"),
    workspace=ak.Workspace(coordinate_format="EPSG:4326"),
    data=[inline],
    views=[
        ak.Map(
            camera=ak.Camera(pitch=0, bearing=0, zoom=13),
            layers=[ak.Layer(inline, type="polygons").style(color="#4a90e2", opacity=0.7)],
        )
    ],
)
spec.save_html(${JSON.stringify(OUTPUT_FILE)})
`;

let server: http.Server;

test.beforeAll(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  execFileSync('python3', ['-c', GENERATE_SCRIPT], { stdio: 'pipe' });
  server = createStaticServer(REPO_ROOT, { cors: false });
  await listen(server, PORT);
});

test.afterAll(async () => {
  await close(server);
});

test.describe('self-contained HTML export', () => {
  test('save_html output renders without any local runtime server', async ({ page, context }) => {
    // The exported page is a top-level-await module: the load event (and the
    // first canvas) only appears after DuckDB init + rendering complete.
    test.setTimeout(120000);
    const html = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Embedded export test');
    // Runtime must be inlined, not referenced from localhost.
    expect(html).not.toContain('autk-runtime/dist/autk-runtime.js');

    const cdnRequests = await routeDuckdbCdnLocal(context);

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    // Fail fast if the page tries to reach any local dev server.
    const localRequests: string[] = [];
    await context.route('http://localhost:8000/**', async (route) => {
      localRequests.push(route.request().url());
      await route.fulfill({ status: 404, body: 'dev server must not be needed' });
    });

    await page.goto(`http://127.0.0.1:${PORT}/tests/results/embedded-export.html`, {
      waitUntil: 'commit',
    });

    // Either the map canvas appears (success) or the error <pre> does.
    const outcome = page.locator('canvas, pre').first();
    await outcome.waitFor({ state: 'attached', timeout: 90000 });

    const tagName = await outcome.evaluate((node) => node.tagName.toLowerCase());
    const errorText = tagName === 'pre' ? await outcome.textContent() : null;
    expect(errorText, `page error: ${errorText}\nconsole: ${errors.join('\n')}`).toBeNull();
    expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(1);
    expect(localRequests, 'no dev-server requests expected').toEqual([]);
    expect(cdnRequests.length, 'DuckDB assets should come from CDN URLs').toBeGreaterThan(0);
  });
});
