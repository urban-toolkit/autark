import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { afterEach, test } from 'node:test';
import { isXml, queryKey, queryOf, withFallback } from '../overpass-fallback.js';

const originalWindow = globalThis.window;
const originalLocation = globalThis.location;
afterEach(() => {
  if (originalLocation === undefined) delete globalThis.location;
  else globalThis.location = originalLocation;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

const query = '[out:xml]; node["amenity"="cafe"](40.0,-3.1,40.1,-3.0); out;';
const endpoint = 'https://overpass-api.de/api/interpreter';

test('query keys match the bundled recordings and ignore timeouts/whitespace', async () => {
  assert.equal(await queryKey(query), '23a46f6462a6bca2');
  assert.equal(await queryKey('[out:json][timeout:60]; out;'), await queryKey('  [out:json][timeout:10];\n out;  '));
  assert.equal(queryOf(`data=${encodeURIComponent(query)}`), query);
  assert.equal(queryOf(query), query);
  assert.equal(isXml(query), true);
});

for (const encodedByServer of [false, true]) {
  test(`replays ${encodedByServer ? 'HTTP-decoded' : 'raw gzip'} recordings after a live failure`, async () => {
    const xml = '<osm version="0.6"/>';
    const requests = [];
    const originalFetch = async input => {
      const url = String(input);
      requests.push(url);
      if (url.startsWith('https://overpass-api.de/')) throw new TypeError('Server unavailable');
      assert.ok(url.endsWith('/data/osm/23a46f6462a6bca2.xml.gz'));
      return encodedByServer
        ? new Response(xml, { headers: { 'Content-Encoding': 'gzip' } })
        : new Response(gzipSync(xml));
    };
    globalThis.window = { fetch: originalFetch };
    const result = await withFallback(async () => {
      // Status polling must never make a real request or delay replay.
      assert.match(await (await window.fetch('https://overpass-api.de/api/status')).text(), /slots available/);
      const response = await window.fetch(new URL(endpoint), { method: 'POST', body: `data=${encodeURIComponent(query)}` });
      return response.text();
    });
    assert.equal(result, xml);
    assert.equal(requests.filter(url => url.startsWith('https://overpass-api.de/')).length, 1);
    assert.equal(window.fetch, originalFetch);
  });
}

test('missing recordings fail clearly and restore fetch', async () => {
  const originalFetch = async input => {
    if (String(input).startsWith('https://overpass-api.de/')) throw new TypeError('Offline');
    return new Response('', { status: 404 });
  };
  globalThis.window = { fetch: originalFetch };
  await assert.rejects(withFallback(() => window.fetch(endpoint, { body: query })), /no recording exists.*Edited queries need the live server/);
  assert.equal(window.fetch, originalFetch);
});

for (const mode of ['offline', 'down']) {
  test(`${mode} mode never contacts the live Overpass server`, async () => {
    globalThis.location = { search: `?overpass=${mode}` };
    const notes = [];
    globalThis.window = { fetch: async input => {
      assert.ok(String(input).includes('/data/osm/'));
      return new Response(gzipSync('<osm/>'));
    } };
    const result = await withFallback(async () => {
      const response = await window.fetch(endpoint, { body: query });
      return response.text();
    }, { note: message => notes.push(message) });
    assert.equal(result, '<osm/>');
    assert.equal(notes.length, 1);
  });
}

test('returns successful live responses without reading recordings', async () => {
  globalThis.window = { fetch: async input => {
    assert.ok(String(input).startsWith('https://overpass-api.de/'));
    return new Response('<osm/>');
  } };
  const result = await withFallback(async () => (await window.fetch(endpoint, { body: query })).text());
  assert.equal(result, '<osm/>');
});

test('passes unrelated requests through and restores fetch when a cell throws', async () => {
  const originalFetch = async () => new Response('local data');
  globalThis.window = { fetch: originalFetch };
  await assert.rejects(withFallback(async () => {
    assert.equal(await (await window.fetch('/data/sample.csv')).text(), 'local data');
    throw new Error('Cell failed');
  }), /Cell failed/);
  assert.equal(window.fetch, originalFetch);
});
