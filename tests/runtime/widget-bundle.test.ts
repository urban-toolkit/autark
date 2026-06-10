import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { test, expect } from '@playwright/test';
import { createStaticServer, listen, close } from '../helpers/static-server';
import { routeDuckdbCdnLocal } from '../helpers/route-duckdb-cdn';

/**
 * Regression test for the anywidget bundle (python/autark/static/autark-widget.js).
 *
 * anywidget loads the widget ESM from a blob: URL, so the bundle must be fully
 * self-contained: no relative chunk imports, bundled schema, and DuckDB assets
 * resolved from the jsDelivr CDN (import.meta.url is not http(s)).
 *
 * The test mimics anywidget: fetch the bundle, import it via a blob: URL, and
 * call its default render() with a fake model. jsDelivr requests are routed to
 * the local @duckdb/duckdb-wasm package so the test is hermetic.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WIDGET_BUNDLE = path.join(REPO_ROOT, 'python', 'autark', 'static', 'autark-widget.js');
const PORT = 8903;

let server: http.Server;

test.beforeAll(async () => {
  server = createStaticServer(REPO_ROOT, { cors: false });
  await listen(server, PORT);
});

test.afterAll(async () => {
  await close(server);
});

const INLINE_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'a' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-74.01, 40.7],
            [-74.0, 40.7],
            [-74.0, 40.71],
            [-74.01, 40.71],
            [-74.01, 40.7],
          ],
        ],
      },
    },
  ],
};

const SPEC = {
  $schema: 'https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json',
  version: '0.1',
  workspace: { name: 'widget_test', coordinateFormat: 'EPSG:4326' },
  data: [
    {
      name: 'inline_polys',
      values: INLINE_GEOJSON,
      layerType: 'polygons',
      coordinateFormat: 'EPSG:4326',
      type: 'geojson',
    },
  ],
  views: [
    {
      type: 'map',
      name: 'widget_map',
      camera: { pitch: 0, bearing: 0, zoom: 13 },
      layers: [
        {
          source: 'inline_polys',
          id: 'inline_layer',
          type: 'polygons',
          style: { color: '#4a90e2', opacity: 0.7 },
        },
      ],
    },
  ],
};

test.describe('anywidget bundle', () => {
  test('renders a spec when imported from a blob: URL with CDN DuckDB assets', async ({ page, context }) => {
    expect(fs.existsSync(WIDGET_BUNDLE), `widget bundle missing - run: cd autk-runtime && npm run build:widget`).toBe(true);

    const cdnRequests = await routeDuckdbCdnLocal(context);

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    // Any served page works; we only need an http origin to host the widget.
    await page.goto(`http://127.0.0.1:${PORT}/test-cross-origin.html?runtimeOrigin=http://127.0.0.1:${PORT}`);

    const result = await page.evaluate(
      async ({ spec }) => {
        // Mimic anywidget: load the ESM from a blob: URL.
        const source = await (await fetch('/python/autark/static/autark-widget.js')).text();
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        const mod = await import(/* @vite-ignore */ moduleUrl);
        URL.revokeObjectURL(moduleUrl);

        const values = new Map<string, unknown>([
          ['spec', spec],
          ['height', '400px'],
        ]);
        const model = {
          get: (name: string) => values.get(name),
          on: () => undefined,
          off: () => undefined,
        };
        const el = document.createElement('div');
        document.body.appendChild(el);
        await mod.default.render({ model, el });
        return {
          html: el.innerHTML.slice(0, 500),
          canvases: el.querySelectorAll('canvas').length,
          errorText: el.querySelector('pre')?.textContent ?? null,
        };
      },
      { spec: SPEC },
    );

    expect(result.errorText, `widget error: ${result.errorText}\nconsole: ${errors.join('\n')}`).toBeNull();
    expect(result.canvases).toBeGreaterThanOrEqual(1);
    expect(cdnRequests.length, 'DuckDB assets should be loaded via the jsDelivr URLs').toBeGreaterThan(0);
  });
});
