import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { queryKey } from '../overpass-fallback.js';
import * as d3 from 'd3';

const root = new URL('../', import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test('all pages, cell sources, and referenced local assets are self-contained', async () => {
  const pages = (await readdir(root)).filter(name => name.endsWith('.html'));
  assert.equal(pages.length, 7);
  let cells = 0;
  for (const page of pages) {
    const html = await readFile(new URL(page, root), 'utf8');
    assert.doesNotMatch(html, /type="importmap"|vendor\/(?:autk|d3|geotiff|duckdb)|(?:gallery|usecases)\//);
    for (const [, source] of html.matchAll(/<script type="text\/plain">([\s\S]*?)<\/script>/g)) {
      assert.doesNotMatch(source, /import\(/, `${page}: cell dependencies must be supplied by the runner`);
      assert.doesNotThrow(() => new AsyncFunction('ctx', 'out', 'show', 'table', 'xmlView', 'withFallback', 'd3', 'autk', 'GeoTIFF', source));
      cells++;
    }
    const references = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]);
    references.push(...[...html.matchAll(/"(data\/[^"\s]+)"/g)].map(match => match[1]));
    for (const ref of references) {
      if (/^https?:/.test(ref)) continue;
      const url = new URL(ref, root);
      url.hash = '';
      assert.ok(url.href.startsWith(root.href), `${page}: reference escapes tutorial: ${ref}`);
      await stat(url);
    }
  }
  assert.ok(cells > 40);
  const urbane = await readFile(new URL('urbane.html', root), 'utf8');
  for (const name of ['arrest', 'new_building', 'noise', 'restaurants', 'school', 'subway', 'tree']) {
    assert.match(urbane, new RegExp(`"${name}"`));
    await stat(new URL(`data/urbane/${name}_manhattan_clean.csv`, root));
  }
  await stat(new URL('data/urbane/mnt.osm.pbf', root));
});

test('the standalone map data cell projects polygons and points to the same meter-based CRS', async () => {
  const html = await readFile(new URL('map.html', root), 'utf8');
  const source = html.match(/data-title="0\.2 · Load neighborhoods and noise events">\s*<script type="text\/plain">([\s\S]*?)<\/script>/)[1];
  const run = new AsyncFunction('ctx', 'd3', source);
  const ctx = {};
  const localD3 = {
    ...d3,
    json: async path => JSON.parse(await readFile(new URL(path, root), 'utf8')),
    csv: async (path, row) => d3.csvParse(await readFile(new URL(path, root), 'utf8'), row),
  };
  const counts = await run(ctx, localD3);
  assert.equal(counts.neighborhoods, 38);
  assert.equal(counts.noiseEvents, 2538);
  const raw = JSON.parse(await readFile(new URL('data/shared/mnt_neighs.geojson', root), 'utf8'));
  for (let i = 0; i < raw.features.length; i++) {
    assert.equal(ctx.neighborhoods.features[i].geometry.coordinates.length, raw.features[i].geometry.coordinates.length);
    const [x, y] = ctx.neighborhoods.features[i].geometry.coordinates[0][0][0];
    assert.ok(x < -8e6 && x > -9e6 && y > 4e6 && y < 6e6, 'Map polygons must be in projected meters, with north-positive Y');
  }
  const row = d3.csvParse(await readFile(new URL('data/map/mnt_noise.csv', root), 'utf8'), d3.autoType)[0];
  const [x, y] = ctx.noise.features[0].geometry.coordinates;
  assert.ok(Math.abs(x - 6378137 * row.longitude * Math.PI / 180) < 1e-6);
  assert.ok(Math.abs(y - 6378137 * Math.log(Math.tan(Math.PI / 4 + row.latitude * Math.PI / 360))) < 1e-6);
  const firstPosition = ctx.neighborhoods.features[0].geometry.coordinates[0][0][0];
  await run(ctx, localD3);
  assert.deepEqual(ctx.neighborhoods.features[0].geometry.coordinates[0][0][0], firstPosition, 'Rerunning the cell must not project twice');
});

test('every bundled Overpass recording is valid and its query still matches its filename', async () => {
  const manifest = JSON.parse(await readFile(new URL('data/osm/manifest.json', root), 'utf8'));
  for (const [name, metadata] of Object.entries(manifest)) {
    const text = gunzipSync(await readFile(new URL(`data/osm/${name}`, root))).toString();
    if (name.endsWith('.json.gz')) assert.ok(Array.isArray(JSON.parse(text).elements));
    else assert.match(text, /<osm/);
    // Some upstream provenance queries were truncated, so only complete entries are hashable.
    if (metadata.query.endsWith('out;') || metadata.query.endsWith('out geom qt;')) {
      assert.ok(name.startsWith(await queryKey(metadata.query)));
    }
  }
});
