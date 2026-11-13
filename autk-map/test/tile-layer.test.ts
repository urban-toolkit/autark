import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Camera, ColorMap } from '@urban-toolkit/autk-core';
import { TileLayer } from '../src/layer-tiles';
import { LayerManager, TILE_LAYER_Z_INDEX } from '../src/layer-manager';
import { MapStyle } from '../src/map-style';
import { lonLatToCrs } from '../src/tile-projection';
import type { LayerInfo, LayerRenderInfo } from '../src/types-layers';
import type { Renderer } from '../src/renderer';
import type { TileSource } from '../src/tile-source';

// ── A device that records instead of drawing ─────────────────────────────────

interface Fake { id: number; label?: string; destroyed: boolean; destroy: () => void; createView: () => unknown }
let nextId = 0;
const fake = (label?: string): Fake => ({ id: nextId++, label, destroyed: false, destroy() { this.destroyed = true; }, createView: () => ({}) });

function fakeRenderer() {
  const textures: Fake[] = [];
  const buffers: Fake[] = [];
  const bindGroups: Array<{ id: number; label?: string }> = [];
  const writes: Array<{ label?: string; data: ArrayBufferView }> = [];
  const device = {
    createShaderModule: () => fake(),
    createBuffer: (d: { label?: string }) => { const b = fake(d.label); buffers.push(b); return b; },
    createBindGroupLayout: () => fake(),
    createPipelineLayout: () => fake(),
    createRenderPipeline: () => fake(),
    createSampler: () => fake(),
    createTexture: (d: { label?: string }) => { const t = fake(d.label); textures.push(t); return t; },
    createBindGroup: (d: { label?: string }) => {
      const bg = { id: nextId++, label: d.label };
      bindGroups.push(bg);
      return bg;
    },
    queue: {
      writeBuffer: (buffer: Fake, _o: number, data: ArrayBufferView) => writes.push({ label: buffer.label, data }),
      writeTexture: () => {},
      copyExternalImageToTexture: () => {},
    },
  };
  const style = {
    getColor: () => ({ r: 1, g: 1, b: 1 }),
    getHighlightColor: () => ({ r: 1, g: 0, b: 0 }),
    getInvalidValueColor: () => ({ r: 0, g: 0, b: 0 }),
  };
  const renderer = { device, canvasFormat: 'bgra8unorm', sampleCount: 4, style } as unknown as Renderer;
  return { renderer, textures, buffers, bindGroups, writes };
}

function fakePass() {
  const calls: Array<{ bindGroup: unknown; indexCount: number; firstIndex: number; baseVertex: number }> = [];
  let current: unknown = null;
  const pass = {
    setPipeline: () => {}, setVertexBuffer: () => {}, setIndexBuffer: () => {},
    setBindGroup: (slot: number, bg: unknown) => { if (slot === 2) current = bg; },
    drawIndexed: (indexCount: number, _i: number, firstIndex: number, baseVertex: number) =>
      calls.push({ bindGroup: current, indexCount, firstIndex, baseVertex }),
  };
  return { pass: pass as unknown as GPURenderPassEncoder, calls };
}

// ── Network and images ───────────────────────────────────────────────────────

interface Request { url: string; settle: () => Promise<void>; fail: (status: number) => Promise<void>; reply: (status: number) => void }
let requests: Request[] = [];
let closed = 0;
/** Real `fetch` rejects when its signal aborts; set to false to model a download that finishes anyway. */
let honourAbort = true;

beforeEach(() => {
  vi.stubGlobal('GPUBufferUsage', { VERTEX: 1, COPY_DST: 2, INDEX: 4, UNIFORM: 8 });
  vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 });
  vi.stubGlobal('GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 });
  requests = [];
  closed = 0;
  honourAbort = true;
  vi.stubGlobal('fetch', (url: string, init?: { signal?: AbortSignal }) => new Promise((resolve, reject) => {
    if (honourAbort) init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    const reply = (status: number) => resolve({ ok: status < 400, status, blob: async () => ({}) });
    // `settle` and `fail` wait on a real timer so decoding finishes; with fake timers use `reply`.
    const respond = (status: number) => async () => {
      reply(status);
      await new Promise((r) => setTimeout(r, 0));
    };
    requests.push({ url, settle: respond(200), fail: (status: number) => respond(status)(), reply });
  }));
  vi.stubGlobal('createImageBitmap', async () => ({ width: 256, height: 256, close: () => { closed++; } }));
});
afterEach(() => vi.unstubAllGlobals());

// ── Fixtures ─────────────────────────────────────────────────────────────────

const INFO: LayerInfo = { id: 'imagery', zIndex: -1, typeLayer: 'tiles' };
const RENDER: LayerRenderInfo = { opacity: 1, colormap: { config: { interpolator: 'seq-reds' } as never }, isSkip: false };
const ORIGIN = lonLatToCrs('EPSG:3395', -43.2, -22.9);
const SOURCE = { urlTemplate: 'https://t.example/{z}/{x}/{y}.png', attribution: '© Example', maxZoom: 19 };

function camera(height: number, tilt = 0): Camera {
  const cam = new Camera({ eye: [0, 0, height], lookAt: [0, 0, 0], up: [0, 1, 0] });
  cam.pitch(-tilt); // leans the view towards the horizon; past about 1.9 it sees only sky
  cam.resize(1600, 1000);
  cam.update();
  return cam;
}

function makeLayer({ origin = ORIGIN, ...extra }: { origin?: readonly number[] | null; [k: string]: unknown } = {}) {
  vi.spyOn(ColorMap, 'getColorMap').mockReturnValue(new Uint8Array(4));
  const gpu = fakeRenderer();
  const layer = new TileLayer(INFO, RENDER, { source: SOURCE, maxTiles: 4, ...extra }, () => origin ?? undefined);
  const changes = vi.fn();
  layer.setChangeListener(changes);
  layer.createPipeline(gpu.renderer);
  return { layer, changes, ...gpu };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('TileLayer', () => {
  it('exposes the attribution', () => {
    expect(makeLayer().layer.attribution).toEqual([{ text: '© Example' }]);
  });

  it('rejects an invalid source when it is created', () => {
    expect(() => new TileLayer(INFO, RENDER, { source: { urlTemplate: 'https://t/{z}/{x}', attribution: 'a' } }, () => ORIGIN)).toThrow(/\{y\}/);
  });

  it('requests nothing until the map has an origin', () => {
    const { layer } = makeLayer({ origin: null });
    layer.prepareRender(camera(2000));
    expect(requests).toHaveLength(0);
  });

  it('requests the visible tiles and their parents', () => {
    const { layer } = makeLayer();
    layer.prepareRender(camera(2000));
    expect(requests.length).toBeGreaterThan(0);
    const zooms = requests.map((r) => Number(r.url.split('/').slice(-3)[0]));
    expect(Math.max(...zooms) - Math.min(...zooms)).toBe(1);
    // The parent level goes out first.
    expect(zooms[0]).toBe(Math.min(...zooms));
    for (const r of requests) expect(r.url).toMatch(/^https:\/\/t\.example\/\d+\/\d+\/\d+\.png$/);
  });

  it('draws loaded tiles, asks for a frame and closes the decoded images', async () => {
    const { layer, changes, textures: allTextures } = makeLayer();
    layer.prepareRender(camera(2000));
    const wanted = requests.length;
    for (const r of [...requests]) await r.settle();
    await flush();

    expect(changes).toHaveBeenCalled();
    const textures = allTextures.filter((t) => t.label === 'Tile texture');
    expect(textures).toHaveLength(wanted);
    expect(closed).toBe(wanted);

    layer.prepareRender(camera(2000));
    const { pass, calls } = fakePass();
    layer.renderPass(camera(2000), pass);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThanOrEqual(4);
    for (const c of calls) expect(c.indexCount).toBeGreaterThan(0);
  });

  it('draws a loading tile with its parent image', async () => {
    const { layer, bindGroups: allBindGroups, writes } = makeLayer();
    const bindGroups = () => allBindGroups.filter((b) => b.label === 'Tile bind group');
    layer.prepareRender(camera(2000));
    const maxZoom = Math.max(...requests.map((r) => Number(r.url.split('/').slice(-3)[0])));
    const parents = requests.filter((r) => Number(r.url.split('/').slice(-3)[0]) < maxZoom);
    for (const r of parents) await r.settle();
    await flush();

    layer.prepareRender(camera(2000));
    const { pass, calls } = fakePass();
    layer.renderPass(camera(2000), pass);

    expect(calls.length).toBeGreaterThan(0);
    const parentBindGroups = new Set(bindGroups());
    for (const c of calls) expect(parentBindGroups.has(c.bindGroup as never)).toBe(true);
    expect(bindGroups()).toHaveLength(parents.length);

    // The texture coordinates select a quarter of the parent image.
    const uv = [...writes].reverse().find((w) => w.label === 'Tile texture coordinate buffer')!.data as Float32Array;
    const used = uv.subarray(0, 8);
    expect(Math.max(...used) - Math.min(...used)).toBeLessThanOrEqual(1);
    expect([...used].some((v) => v === 0.5)).toBe(true);
  });

  it('does nothing for an orthographic camera that was never given a viewport', () => {
    const overlay = new Camera();
    overlay.setOrthographicBounds(-1000, 1000, -1000, 1000);
    expect(overlay.getViewportWidth()).toBe(0);

    const { layer } = makeLayer();
    layer.prepareRender(overlay);
    expect(requests).toHaveLength(0);
    expect(layer.stats).toMatchObject({ selectedTiles: 0, zoom: null, requests: 0, idle: true });
    const { pass, calls } = fakePass();
    layer.renderPass(overlay, pass);
    expect(calls).toHaveLength(0);
  });

  it('selects tiles for the terrain overlay camera once it has a viewport', () => {
    // The terrain path draws layers with an orthographic camera resized to the overlay's pixel rectangle.
    const overlay = new Camera();
    overlay.setOrthographicBounds(-2000, 2000, -1500, 1500);
    overlay.resize(1600, 1200);

    const { layer } = makeLayer({ maxTiles: 64 });
    layer.prepareRender(overlay);
    expect(requests.length).toBeGreaterThan(0);
    expect(layer.stats.selectedTiles).toBeGreaterThan(0);
    expect(layer.stats.zoom).not.toBeNull();
  });

  it('draws nothing while nothing has loaded', () => {
    const { layer } = makeLayer();
    layer.prepareRender(camera(2000));
    const { pass, calls } = fakePass();
    layer.renderPass(camera(2000), pass);
    expect(calls).toHaveLength(0);
  });

  it('does not draw a tile that failed for good, and warns only a few times', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { layer } = makeLayer();
    layer.prepareRender(camera(2000));
    for (const r of [...requests]) await r.fail(404);
    await flush();
    expect(warn.mock.calls.length).toBeGreaterThan(0);
    expect(warn.mock.calls.length).toBeLessThanOrEqual(3);
    expect(String(warn.mock.calls[0]![0])).toContain("Tile layer 'imagery'");
    const { pass, calls } = fakePass();
    layer.prepareRender(camera(2000));
    layer.renderPass(camera(2000), pass);
    expect(calls).toHaveLength(0);
  });

  it('writes opacity through the render-state uniforms', () => {
    const { layer, writes } = makeLayer();
    layer.updateLayerRenderInfo({ opacity: 0.4 });
    const { pass } = fakePass();
    layer.prepareRender(camera(2000));
    layer.renderPass(camera(2000), pass);
    expect(writes.some((w) => w.data instanceof Float32Array && w.data.length === 1 && Math.abs(w.data[0]! - 0.4) < 1e-6)).toBe(true);
  });

  it('keeps the tiles in view even when they exceed the cache, and frees them after the view moves', async () => {
    const { layer, textures } = makeLayer({ maxCachedTiles: 2 });
    const tileTextures = () => textures.filter((t) => t.label === 'Tile texture');
    layer.prepareRender(camera(2000));
    for (const r of [...requests]) await r.settle();
    await flush();
    const loaded = tileTextures().length;
    expect(loaded).toBeGreaterThan(2);

    for (let i = 0; i < 3; i++) layer.prepareRender(camera(2000));
    expect(tileTextures().filter((t) => t.destroyed)).toHaveLength(0);

    // Looking at the sky admits no new tile, so only the end of the frame can free the old ones.
    layer.prepareRender(camera(2000, 2.2));
    expect(tileTextures().filter((t) => t.destroyed)).toHaveLength(loaded - 2);
  });

  it('destroys textures and buffers and stops loading', async () => {
    const { layer, textures: allTextures } = makeLayer();
    layer.prepareRender(camera(2000));
    for (const r of [...requests].slice(0, 2)) await r.settle();
    await flush();
    const textures = allTextures.filter((t) => t.label === 'Tile texture');
    expect(textures.length).toBeGreaterThan(0);

    layer.destroy();
    expect(textures.every((t) => t.destroyed)).toBe(true);

    const count = requests.length;
    layer.prepareRender(camera(2000));
    expect(requests).toHaveLength(count);
  });
});

describe('tile layer statistics', () => {
  const MIB = 1024 * 1024;

  it('reports a layer that has not selected anything yet', () => {
    const { layer } = makeLayer();
    expect(layer.stats).toMatchObject({
      visible: true, zoom: null, wantedZoom: null, selectedTiles: 0, readyTiles: 0, fallbackTiles: 0, missingTiles: 0,
      cachedTextures: 0, textureBytes: 0, requests: 0, cacheReuses: 0, evictions: 0, idle: true,
    });
    expect(layer.stats.cacheLimit).toBe(256);
  });

  it('splits the selection into own image, ancestor image and missing, and they add up', async () => {
    const { layer } = makeLayer();
    layer.prepareRender(camera(2000));
    const loading = layer.stats;
    expect(loading.selectedTiles).toBeGreaterThan(0);
    expect(loading).toMatchObject({ readyTiles: 0, fallbackTiles: 0, missingTiles: loading.selectedTiles, idle: false });
    expect(loading.requests).toBe(requests.length);
    expect(loading.zoom).toBeGreaterThan(0);

    const maxZoom = Math.max(...requests.map((r) => Number(r.url.split('/').slice(-3)[0])));
    for (const r of requests.filter((r) => Number(r.url.split('/').slice(-3)[0]) < maxZoom)) await r.settle();
    await flush();
    layer.prepareRender(camera(2000));
    const parents = layer.stats;
    expect(parents.fallbackTiles).toBeGreaterThan(0);
    expect(parents.readyTiles + parents.fallbackTiles + parents.missingTiles).toBe(parents.selectedTiles);

    for (const r of [...requests]) await r.settle();
    await flush();
    layer.prepareRender(camera(2000));
    const done = layer.stats;
    expect(done).toMatchObject({ readyTiles: done.selectedTiles, fallbackTiles: 0, missingTiles: 0, activeRequests: 0, queuedRequests: 0, waitingRetries: 0, idle: true });
  });

  it('estimates texture memory from the real tile size', async () => {
    const { layer } = makeLayer();
    layer.prepareRender(camera(2000));
    for (const r of [...requests]) await r.settle();
    await flush();
    const { cachedTextures, textureBytes } = layer.stats;
    expect(cachedTextures).toBe(requests.length);
    expect(textureBytes).toBe(cachedTextures * 256 * 256 * 4);
    expect(textureBytes / MIB).toBeCloseTo(cachedTextures * 0.25, 6);
  });

  it('shows when the tile cap made the tiles coarser than the view asked for', () => {
    const free = makeLayer({ maxTiles: 1000 }).layer;
    free.prepareRender(camera(2000));
    expect(free.stats.wantedZoom).toBe(free.stats.zoom);

    const capped = makeLayer({ maxTiles: 4 }).layer;
    capped.prepareRender(camera(2000));
    expect(capped.stats.zoom).toBeLessThan(capped.stats.wantedZoom!);
    expect(capped.stats.wantedZoom).toBe(free.stats.zoom);
  });

  it('flags a selection that was cut to the tile cap', () => {
    const narrow = { urlTemplate: 'https://t.example/{z}/{x}/{y}.png', attribution: 'a', minZoom: 19, maxZoom: 19 };
    const { layer } = makeLayer({ source: narrow, maxTiles: 4 });
    layer.prepareRender(camera(200000));
    expect(layer.stats).toMatchObject({ truncated: true, zoom: 19 });
    expect(layer.stats.selectedTiles).toBeLessThanOrEqual(4);
  });

  it('counts a reuse when hidden tiles are shown again, with no new requests', async () => {
    const { layer } = makeLayer();
    layer.prepareRender(camera(2000));
    for (const r of [...requests]) await r.settle();
    await flush();
    layer.prepareRender(camera(2000));
    const before = layer.stats;
    expect(before.cacheReuses).toBe(0);

    layer.updateLayerRenderInfo({ isSkip: true });
    expect(layer.stats).toMatchObject({ visible: false, selectedTiles: 0, activeRequests: 0 });
    layer.updateLayerRenderInfo({ isSkip: false });
    layer.prepareRender(camera(2000));
    const after = layer.stats;
    expect(after.cacheReuses).toBe(before.selectedTiles + (before.cachedTextures - before.selectedTiles));
    expect(after.requests).toBe(before.requests);
    expect(after.readyTiles).toBe(before.readyTiles);
    layer.prepareRender(camera(2000)); // another frame of the same view is not another reuse
    expect(layer.stats.cacheReuses).toBe(after.cacheReuses);
  });

  it('counts the textures the cache destroyed to make room', async () => {
    const { layer, textures } = makeLayer({ maxCachedTiles: 2 });
    layer.prepareRender(camera(2000));
    for (const r of [...requests]) await r.settle();
    await flush();
    const loaded = layer.stats.cachedTextures;
    layer.prepareRender(camera(2000, 2.2)); // looking at the sky frees the cache down to its limit
    const destroyed = textures.filter((t) => t.label === 'Tile texture' && t.destroyed).length;
    expect(layer.stats).toMatchObject({ cachedTextures: 2, evictions: loaded - 2 });
    expect(layer.stats.evictions).toBe(destroyed); // the counter matches what was actually freed
  });

  it('shows tiles that are waiting to retry, and is not idle while they wait', async () => {
    vi.useFakeTimers();
    const { layer } = makeLayer({ maxTiles: 1 });
    layer.prepareRender(camera(2000));
    for (const r of [...requests]) r.reply(500); // a transient server error
    await vi.advanceTimersByTimeAsync(0);
    expect(layer.stats.waitingRetries).toBeGreaterThan(0);
    expect(layer.stats.idle).toBe(false);
    expect(layer.stats.activeRequests).toBe(0);
    vi.useRealTimers();
  });

  it('is cheap to read and never asks for a frame', async () => {
    const { layer, changes } = makeLayer();
    layer.prepareRender(camera(2000));
    changes.mockClear();
    for (let i = 0; i < 50; i++) void layer.stats;
    expect(changes).not.toHaveBeenCalled();
  });
});

describe('hiding a tile layer', () => {
  const hide = (layer: TileLayer) => layer.updateLayerRenderInfo({ isSkip: true });
  const show = (layer: TileLayer) => layer.updateLayerRenderInfo({ isSkip: false });
  const tileTextures = (textures: Array<{ label?: string; destroyed: boolean }>) => textures.filter((t) => t.label === 'Tile texture');

  afterEach(() => vi.useRealTimers());

  it('cancels queued and in-flight requests', async () => {
    const { layer, changes, textures } = makeLayer({ maxTiles: 40 });
    layer.prepareRender(camera(2000));
    const started = [...requests];
    expect(layer.pendingTiles).toBeGreaterThan(started.length); // more than the loader runs at once, so some are queued

    hide(layer);
    changes.mockClear();
    await flush();
    expect(layer.pendingTiles).toBe(0);

    for (const r of started) await r.settle(); // too late: the requests were aborted
    await flush();
    expect(requests).toHaveLength(started.length); // nothing new was requested
    expect(tileTextures(textures)).toHaveLength(0);
    expect(changes).not.toHaveBeenCalled(); // and no frame was asked for
  });

  it('spends no GPU work on a tile that finishes downloading after it was cancelled', async () => {
    honourAbort = false;
    const { layer, changes, textures } = makeLayer({ maxTiles: 1 });
    layer.prepareRender(camera(2000));
    const started = [...requests];

    hide(layer);
    changes.mockClear();
    for (const r of started) await r.settle(); // the download completes anyway
    await flush();
    expect(tileTextures(textures)).toHaveLength(0);
    expect(closed).toBe(started.length); // the decoded images are still released
    expect(changes).not.toHaveBeenCalled();
  });

  it('stops loader retries that are waiting to run', async () => {
    vi.useFakeTimers();
    const { layer } = makeLayer({ maxTiles: 1 });
    layer.prepareRender(camera(2000));
    const first = requests.length;
    for (const r of [...requests]) r.reply(500);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(first); // the loader is now waiting to retry

    hide(layer);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(requests).toHaveLength(first);
  });

  it('stops the retry timer that waits after the loader gives up', async () => {
    vi.useFakeTimers();
    const { layer } = makeLayer({ maxTiles: 1 });
    layer.prepareRender(camera(2000));
    // Fail every request until the loader has used its retries and the store has set a cooldown.
    for (let round = 0; round < 6; round++) {
      for (const r of [...requests]) r.reply(500);
      await vi.advanceTimersByTimeAsync(1500);
    }
    const before = requests.length;

    hide(layer);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(requests).toHaveLength(before);
  });

  it('keeps the textures that are ready and uses them again when shown', async () => {
    const { layer, textures } = makeLayer();
    layer.prepareRender(camera(2000));
    for (const r of [...requests]) await r.settle();
    await flush();
    const loaded = tileTextures(textures).length;
    const requested = requests.length;
    expect(loaded).toBeGreaterThan(0);

    hide(layer);
    expect(tileTextures(textures).filter((t) => t.destroyed)).toHaveLength(0);

    show(layer);
    layer.prepareRender(camera(2000));
    expect(requests).toHaveLength(requested); // everything it needs is still there
    const { pass, calls } = fakePass();
    layer.renderPass(camera(2000), pass);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('resumes loading what is missing when shown, and asks for a frame', async () => {
    const { layer, changes } = makeLayer();
    layer.prepareRender(camera(2000));
    const started = requests.length;
    hide(layer);
    await flush(); // the aborted requests release their slots
    changes.mockClear();

    show(layer);
    expect(changes).toHaveBeenCalled(); // the map will render, and prepareRender will run
    layer.prepareRender(camera(2000));
    expect(requests.length).toBe(started * 2); // the cancelled tiles are requested again
  });

  it('does not suspend twice or touch a layer that was never hidden', () => {
    const { layer } = makeLayer();
    layer.prepareRender(camera(2000));
    const started = requests.length;
    layer.updateLayerRenderInfo({ opacity: 0.5 });
    show(layer); // already visible
    expect(layer.pendingTiles).toBe(started);
  });
});

describe('tile layers in the LayerManager', () => {
  const polygon = (id: string, typeLayer: 'surface' | 'polygons'): [LayerInfo, LayerRenderInfo] => [
    { id, zIndex: 0, typeLayer },
    { ...RENDER },
  ];

  it('places tile layers below surface, in load order, without taking a dynamic slot', () => {
    const manager = new LayerManager();
    manager.initializeOrigin({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 1] } }] });
    const tiles = (id: string) => manager.addTileLayer({ id, zIndex: 0, typeLayer: 'tiles' }, { ...RENDER }, { source: SOURCE });

    const a = tiles('a')!;
    const b = tiles('b')!;
    expect(a.layerInfo.zIndex).toBe(TILE_LAYER_Z_INDEX);
    expect(b.layerInfo.zIndex).toBe(TILE_LAYER_Z_INDEX);
    expect(TILE_LAYER_Z_INDEX).toBeLessThan(0);
    expect(manager.layers.map((l) => l.layerInfo.id)).toEqual(['a', 'b']);
  });

  it('refuses a duplicate id', () => {
    const manager = new LayerManager();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(manager.addTileLayer({ id: 'a', zIndex: 0, typeLayer: 'tiles' }, { ...RENDER }, { source: SOURCE })).not.toBeNull();
    expect(manager.addTileLayer({ id: 'a', zIndex: 0, typeLayer: 'tiles' }, { ...RENDER }, { source: SOURCE })).toBeNull();
    expect(error).toHaveBeenCalled();
    void polygon;
  });

  it('sorts a tile layer under layers loaded before it', () => {
    const manager = new LayerManager();
    manager.initializeOrigin({ type: 'FeatureCollection', features: [] });
    const tiles = manager.addTileLayer({ id: 'basemap', zIndex: 0, typeLayer: 'tiles' }, { ...RENDER }, { source: SOURCE })!;
    expect(manager.layers[0]).toBe(tiles);
    expect(manager.searchByLayerId('basemap')).toBe(tiles);
    manager.removeLayerById('basemap');
    expect(manager.layers).toHaveLength(0);
  });
});

describe('attribution of tile layers in the LayerManager', () => {
  const add = (manager: LayerManager, id: string, attribution: TileSource['attribution']) =>
    manager.addTileLayer({ id, zIndex: 0, typeLayer: 'tiles' }, { ...RENDER }, { source: { ...SOURCE, attribution } })!;

  it('credits each visible layer once, in layer order', () => {
    const manager = new LayerManager();
    add(manager, 'a', [{ text: '© OSM', url: 'https://www.openstreetmap.org/copyright' }, '© A']);
    add(manager, 'b', [{ text: '© OSM', url: 'https://www.openstreetmap.org/copyright' }, '© B']);
    expect(manager.visibleAttribution()).toEqual([
      { text: '© OSM', url: 'https://www.openstreetmap.org/copyright' },
      { text: '© A' },
      { text: '© B' },
    ]);
  });

  it('stops crediting a layer that is hidden or removed, and resumes when it is shown', () => {
    const manager = new LayerManager();
    const a = add(manager, 'a', '© A');
    add(manager, 'b', '© B');
    a.updateLayerRenderInfo({ isSkip: true });
    expect(manager.visibleAttribution()).toEqual([{ text: '© B' }]);
    a.updateLayerRenderInfo({ isSkip: false });
    expect(manager.visibleAttribution()).toEqual([{ text: '© A' }, { text: '© B' }]);
    manager.removeLayerById('b');
    expect(manager.visibleAttribution()).toEqual([{ text: '© A' }]);
    manager.removeLayerById('a');
    expect(manager.visibleAttribution()).toEqual([]);
  });

  it('keeps credits with the same text and different links apart', () => {
    const manager = new LayerManager();
    add(manager, 'a', { text: '© X', url: 'https://x.example/1' });
    add(manager, 'b', { text: '© X', url: 'https://x.example/2' });
    expect(manager.visibleAttribution()).toHaveLength(2);
  });
});

describe('map style keys', () => {
  it('do not include tiles', () => {
    const style = new MapStyle('default');
    // A custom style has one color per drawable family; none is needed for imagery.
    expect(() => style.setCustomStyle({
      background: '#fff', surface: '#eee', parks: '#cfc', water: '#bdf', roads: '#ddd',
      buildings: '#ccc', points: '#555', polylines: '#777', polygons: '#999',
    })).not.toThrow();
  });
});


describe('tile integration validation and partial resources', () => {
  it.each([
    { crs: 'EPSG:9999' }, { maxCachedTiles: NaN }, { maxCachedTiles: Infinity },
    { maxCachedTiles: 0 }, { maxTiles: 1.5 }, { maxTiles: -1 }, { zoomBias: Infinity },
    { maxDistanceInHeights: 0 },
  ])('rejects invalid options before creating a pipeline: %j', options => {
    expect(() => makeLayer(options)).toThrow();
    expect(requests).toHaveLength(0);
  });

  it.each([NaN, -0.1, 1.1])('rejects invalid opacity %s', opacity => {
    expect(() => new TileLayer(INFO, { ...RENDER, opacity }, { source: SOURCE }, () => ORIGIN)).toThrow(/opacity/);
  });

  it('owns and releases allocations when pipeline setup fails halfway through', () => {
    vi.spyOn(ColorMap, 'getColorMap').mockReturnValue(new Uint8Array(4));
    const gpu = fakeRenderer();
    const layer = new TileLayer(INFO, RENDER, { source: SOURCE }, () => ORIGIN);
    vi.spyOn(gpu.renderer.device, 'createBindGroup').mockImplementation(() => { throw new Error('allocation failed'); });
    expect(() => layer.createPipeline(gpu.renderer)).toThrow('allocation failed');
    expect(gpu.buffers.length).toBeGreaterThan(0);
    layer.destroy();
    expect(gpu.buffers.every(buffer => buffer.destroyed)).toBe(true);
    expect(gpu.textures.every(texture => texture.destroyed)).toBe(true);
    layer.destroy();
  });
});

describe('tile renderer integration', () => {
  it('uses the offscreen target viewport instead of the main canvas backing store', () => {
    const { layer, renderer } = makeLayer({ maxTiles: 10000 });
    Object.defineProperties(renderer, { pixelWidth: { value: 1600 }, pixelHeight: { value: 1000 } });
    const view = new Camera();
    view.setOrthographicBounds(-4000, 4000, -2500, 2500);
    view.resize(1600, 1000);
    layer.prepareRender(view);
    const zoom = layer.stats.wantedZoom!;
    layer.prepareRender(view, [3200, 2000]);
    expect(layer.stats.wantedZoom).toBe(zoom + 1);
    expect(view.getViewportWidth()).toBe(1600);
    layer.destroy();
  });
  it('reads the renderer backing store instead of treating camera CSS dimensions as device pixels', () => {
    const { layer, renderer } = makeLayer({ maxTiles: 10000 });
    const view = camera(4000);
    layer.prepareRender(view);
    const zoom = layer.stats.wantedZoom!;
    Object.defineProperties(renderer, { pixelWidth: { value: 3200 }, pixelHeight: { value: 2000 } });
    layer.prepareRender(view);
    expect(layer.stats.wantedZoom).toBe(zoom + 1);
    expect(view.getViewportWidth()).toBe(1600);
    layer.destroy();
  });

  it('releases a texture when external image upload throws', async () => {
    const { layer, renderer, textures } = makeLayer();
    vi.spyOn(renderer.device.queue, 'copyExternalImageToTexture').mockImplementation(() => { throw new Error('upload failed'); });
    layer.prepareRender(camera(2000));
    await requests[0]!.settle();
    const allocated = textures.filter(texture => texture.label === 'Tile texture');
    expect(allocated.length).toBeGreaterThan(0);
    expect(allocated.every(texture => texture.destroyed)).toBe(true);
    layer.destroy();
  });
});
