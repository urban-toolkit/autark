import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEM_BITMAP_OPTIONS, decodeDemPixels, decodeHeight, isDemEncoding } from '../src/dem-decode';
import type { DemTile } from '../src/dem-decode';
import { fetchDemTile } from '../src/dem-load';
import { DemSampler } from '../src/dem-sample';
import { MAX_WINDOW_SIZE, composeWindow, composeWindowSteps, crsScaleAt, maxTilesPerWindow, planWindow } from '../src/height-window';
import { heightAt } from '../src/height-source';
import type { TileIndex } from '../src/tile-index';
import { tileKey } from '../src/tile-index';
import { TileLoadError } from '../src/tile-loader';
import { WEB_MERCATOR_EXTENT, crsToLonLat, lonLatToCrs } from '../src/tile-projection';
import type { TileCrs } from '../src/tile-projection';

const SIZE = 256;
const A = 0.0001;
const B = 0.0002;
/** Height of the synthetic DEM at a spherical Mercator position: linear, so bilinear sampling is exact. */
const plane = (x: number, y: number) => A * x + B * y;

type Surface = (x: number, y: number) => number;

/** A tile of the synthetic DEM: each pixel holds the surface at its centre. */
function planeTile(tile: TileIndex, surface: Surface = plane, size = SIZE): DemTile {
  const pm = (2 * WEB_MERCATOR_EXTENT) / (size * 2 ** tile.z);
  const heights = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -WEB_MERCATOR_EXTENT + (tile.x * size + i + 0.5) * pm;
      const y = WEB_MERCATOR_EXTENT - (tile.y * size + j + 0.5) * pm;
      heights[j * size + i] = surface(x, y);
    }
  }
  return { size, heights, min: Math.min(...heights), max: Math.max(...heights) };
}

/** A lookup over the synthetic DEM that serves only the zooms and tiles `allow` accepts. */
function demLookup(allow: (tile: TileIndex) => boolean = () => true, surface: Surface = plane) {
  const calls: TileIndex[] = [];
  const cache = new Map<string, DemTile>();
  const lookup = (tile: TileIndex) => {
    calls.push(tile);
    if (!allow(tile)) return undefined;
    const key = tileKey('dem', tile);
    if (!cache.has(key)) cache.set(key, planeTile(tile, surface));
    return cache.get(key);
  };
  return { lookup, calls };
}

const ORIGIN_LONLAT: [number, number] = [-43.1, -22.9];
const originFor = (crs: TileCrs) => lonLatToCrs(crs, ORIGIN_LONLAT[0], ORIGIN_LONLAT[1]);

/**
 * A steep surface measured from the map origin, so heights stay small (a few hundred metres) and float32
 * keeps millimetres. A shift of half a pixel or one sample changes it by tens of centimetres.
 */
const [ORIGIN_X, ORIGIN_Y] = lonLatToCrs('EPSG:3857', ORIGIN_LONLAT[0], ORIGIN_LONLAT[1]);
const steep: Surface = (x, y) => 0.02 * (x - ORIGIN_X) + 0.04 * (y - ORIGIN_Y);

describe('decoding', () => {
  it('decodes known Terrarium and Mapbox values', () => {
    expect(decodeHeight(128, 0, 0, 'terrarium')).toBe(0);
    expect(decodeHeight(128, 1, 128, 'terrarium')).toBeCloseTo(1.5, 9);
    expect(decodeHeight(127, 255, 0, 'terrarium')).toBeCloseTo(-1, 9);
    expect(decodeHeight(0, 0, 0, 'mapbox')).toBe(-10000);
    expect(decodeHeight(1, 134, 160, 'mapbox')).toBeCloseTo(0, 6);
    expect(decodeHeight(1, 134, 170, 'mapbox')).toBeCloseTo(1, 6);
  });

  it('decodes a tile, marks transparent pixels as no data, and reports its range', () => {
    // 2 x 2: 0 m, 1.5 m, transparent, -1 m
    const rgba = [128, 0, 0, 255, 128, 1, 128, 255, 9, 9, 9, 0, 127, 255, 0, 255];
    const tile = decodeDemPixels(rgba, 2, 'terrarium');
    expect(tile.size).toBe(2);
    expect(tile.heights[0]).toBe(0);
    expect(tile.heights[1]).toBeCloseTo(1.5, 6);
    expect(Number.isNaN(tile.heights[2]!)).toBe(true);
    expect(tile.heights[3]).toBeCloseTo(-1, 6);
    expect([tile.min, tile.max]).toEqual([-1, 1.5]);
  });

  it('reports a range of zero for a tile without data, and rejects a wrong byte count', () => {
    const tile = decodeDemPixels(new Array(16).fill(0), 2, 'terrarium');
    expect([tile.min, tile.max]).toEqual([0, 0]);
    expect(() => decodeDemPixels(new Array(15).fill(0), 2, 'terrarium')).toThrow(/2 x 2/);
  });

  it('names the supported encodings', () => {
    expect(isDemEncoding('terrarium')).toBe(true);
    expect(isDemEncoding('mapbox')).toBe(true);
    expect(isDemEncoding('rgb')).toBe(false);
  });
});

describe('fetchDemTile', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(bitmapSize: number, rgba: number[]) {
    const bitmap = { width: bitmapSize, height: bitmapSize, close: vi.fn() };
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, blob: async () => ({}) }));
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() { return { drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(rgba) }) }; }
    });
    return { bitmap, createImageBitmap };
  }

  it('reads the pixels as stored, decodes them, and closes the bitmap', async () => {
    const { bitmap, createImageBitmap } = stub(2, [128, 0, 0, 255, 128, 1, 128, 255, 128, 0, 0, 255, 128, 0, 0, 255]);
    const tile = await fetchDemTile('https://t/1/0/0.png', new AbortController().signal, 'terrarium', 2);
    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), DEM_BITMAP_OPTIONS);
    expect(DEM_BITMAP_OPTIONS).toMatchObject({ colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    expect(tile.heights[1]).toBeCloseTo(1.5, 6);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('rejects an image of the wrong size as a permanent failure and still closes it', async () => {
    const { bitmap } = stub(512, []);
    const error = await fetchDemTile('https://t/1/0/0.png', new AbortController().signal, 'terrarium', 256).catch((e) => e);
    expect(error).toBeInstanceOf(TileLoadError);
    expect(error.permanent).toBe(true);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});

describe('DemSampler', () => {
  it('reproduces a linear surface exactly inside a tile and across a tile edge', () => {
    const { lookup } = demLookup();
    const sampler = new DemSampler(lookup, SIZE);
    const z = 5;
    const pm = (2 * WEB_MERCATOR_EXTENT) / (SIZE * 2 ** z);
    const at = (px: number, py: number) => plane(-WEB_MERCATOR_EXTENT + px * pm, WEB_MERCATOR_EXTENT - py * pm);
    for (const [px, py] of [[1000.3, 2000.7], [255.9, 255.9], [256.0, 256.0], [256.4, 100.2], [3000.5, 3000.5]] as const) {
      expect(sampler.sample(z, px, py)).toBeCloseTo(at(px, py), 3);
    }
  });

  it('falls back to a coarser tile, and gives NaN when nothing is loaded', () => {
    const z = 6;
    const coarse = demLookup((tile) => tile.z <= 4);
    const sampler = new DemSampler(coarse.lookup, SIZE);
    const pm = (2 * WEB_MERCATOR_EXTENT) / (SIZE * 2 ** z);
    const px = 5000.2;
    const py = 6000.8;
    const expected = plane(-WEB_MERCATOR_EXTENT + px * pm, WEB_MERCATOR_EXTENT - py * pm);
    expect(sampler.sample(z, px, py)).toBeCloseTo(expected, 3);
    expect(new DemSampler(demLookup(() => false).lookup, SIZE).sample(z, px, py)).toBeNaN();
    // A floor on the fallback stops it before the loaded zoom.
    expect(sampler.sample(z, px, py, 5)).toBeNaN();
  });

  it('uses the nearest pixel for a neighbour that is missing, and wraps around the world in x', () => {
    const z = 2;
    // Only the tile that holds the point; its east neighbour is not loaded.
    const only = demLookup((tile) => tile.z === z && tile.x === 0 && tile.y === 1);
    const sampler = new DemSampler(only.lookup, SIZE);
    const edge = SIZE - 0.5 - 0.1; // just west of the tile's east edge, so the east pixel is another tile
    const value = sampler.sample(z, edge, SIZE + 10);
    expect(Number.isFinite(value)).toBe(true);

    // Pixel -0.5 is the last pixel of the world's east edge; the west edge sample reads across the seam.
    const all = new DemSampler(demLookup().lookup, SIZE);
    expect(Number.isFinite(all.sample(z, 0.2, SIZE + 10))).toBe(true);
    expect(Number.isFinite(all.sample(z, SIZE * 4 - 0.2, SIZE + 10))).toBe(true);
  });

  it('treats no-data pixels like missing ones', () => {
    const hole: DemTile = { size: 2, heights: new Float32Array([NaN, 5, 5, 5]), min: 5, max: 5 };
    const sampler = new DemSampler(() => hole, 2);
    // Zoom 0 with a 2-pixel tile; position just inside the no-data pixel.
    expect(sampler.sample(0, 0.5, 0.5, 0)).toBeNaN();
    expect(sampler.sample(0, 1.5, 0.5, 0)).toBe(5);
    expect(sampler.sample(0, 1.2, 0.8, 0)).toBe(5);
  });

  it('looks each tile up once per sampler', () => {
    const { lookup, calls } = demLookup();
    const sampler = new DemSampler(lookup, SIZE);
    for (let i = 0; i < 50; i++) sampler.sample(5, 1000 + i * 0.5, 2000 + i * 0.25);
    const keys = new Set(calls.map((t) => tileKey('dem', t)));
    expect(calls.length).toBe(keys.size);
  });

  it('rejects a tile of the wrong size', () => {
    const sampler = new DemSampler(() => ({ size: 4, heights: new Float32Array(16), min: 0, max: 0 }), SIZE);
    expect(() => sampler.sample(0, 10, 10)).toThrow(/expected 256/);
  });
});

describe('crsScaleAt', () => {
  it('is one for EPSG:3857', () => {
    const scale = crsScaleAt('EPSG:3857', originFor('EPSG:3857') as [number, number]);
    expect(scale.x).toBeCloseTo(1, 9);
    expect(scale.y).toBeCloseTo(1, 9);
  });

  it('matches the Mercator derivative ratio for EPSG:3395', () => {
    const e2 = 0.0818191908426215 ** 2;
    const sin = Math.sin(ORIGIN_LONLAT[1] * (Math.PI / 180));
    const scale = crsScaleAt('EPSG:3395', originFor('EPSG:3395') as [number, number]);
    expect(scale.x).toBeCloseTo(1, 9);
    expect(scale.y).toBeCloseTo((1 - e2) / (1 - e2 * sin * sin), 5);
  });

  it('turns metres into degrees for EPSG:4326', () => {
    const scale = crsScaleAt('EPSG:4326', originFor('EPSG:4326') as [number, number]);
    expect(scale.x).toBeCloseTo(180 / Math.PI / 6378137, 12);
    expect(scale.y).toBeGreaterThan(0);
  });
});

describe('planWindow', () => {
  const crs: TileCrs = 'EPSG:3395';
  const origin = originFor(crs) as [number, number];
  const scale = crsScaleAt(crs, origin);
  const base = { crs, origin, scale, zoom: 12, tileSize: SIZE, size: 512 };

  it('spaces samples one tile pixel apart', () => {
    const plan = planWindow({ ...base, centre: [0, 0] });
    const pm = (2 * WEB_MERCATOR_EXTENT) / (SIZE * 2 ** 12);
    expect(plan.cellSizeX).toBeCloseTo(pm * scale.x, 9);
    expect(plan.cellSizeY).toBeCloseTo(pm * scale.y, 9);
  });

  it('snaps to whole samples: a smaller move changes nothing, a whole sample moves it by one', () => {
    const first = planWindow({ ...base, centre: [0, 0] });
    const nudged = planWindow({ ...base, centre: [first.cellSizeX * 0.3, first.cellSizeY * -0.3] });
    expect([nudged.latticeX, nudged.latticeY]).toEqual([first.latticeX, first.latticeY]);
    expect([nudged.originX, nudged.originY]).toEqual([first.originX, first.originY]);

    const moved = planWindow({ ...base, centre: [first.cellSizeX * 3, first.cellSizeY * 2] });
    expect(moved.latticeX - first.latticeX).toBe(3);
    expect(moved.latticeY - first.latticeY).toBe(2);
    expect(moved.originX - first.originX).toBeCloseTo(3 * first.cellSizeX, 6);
  });

  it('is centred on the requested point', () => {
    const plan = planWindow({ ...base, centre: [1234, -567] });
    const centreX = plan.originX + (plan.size / 2) * plan.cellSizeX;
    const centreY = plan.originY + (plan.size / 2) * plan.cellSizeY;
    expect(Math.abs(centreX - 1234)).toBeLessThanOrEqual(plan.cellSizeX / 2 + 1e-6);
    expect(Math.abs(centreY + 567)).toBeLessThanOrEqual(plan.cellSizeY / 2 + 1e-6);
  });

  it('needs at most 3 x 3 tiles of its own zoom, including the centre tile', () => {
    for (const centre of [[0, 0], [50000, -30000], [-123456, 98765]] as const) {
      const plan = planWindow({ ...base, centre });
      expect(plan.tiles.length).toBeGreaterThan(0);
      expect(plan.tiles.length).toBeLessThanOrEqual(9);
      expect(plan.tiles.every((t) => t.z === 12)).toBe(true);
    }
    const plan = planWindow({ ...base, centre: [0, 0] });
    const [lon, lat] = ORIGIN_LONLAT;
    const n = 2 ** 12;
    const cx = Math.floor(((lon + 180) / 360) * n);
    expect(plan.tiles.some((t) => t.x === cx)).toBe(true);
    expect(lat).toBeLessThan(0);
  });

  it('rejects an odd or non-positive size', () => {
    expect(() => planWindow({ ...base, size: 511, centre: [0, 0] })).toThrow(/even/);
    expect(() => planWindow({ ...base, size: 0, centre: [0, 0] })).toThrow(/even/);
  });
});

describe('tile demand bound', () => {
  it('is at least what any window needs, for several sizes, zooms, systems and positions', () => {
    let seed = 12345;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    let worst = 0;
    for (const crs of ['EPSG:3857', 'EPSG:3395', 'EPSG:4326'] as const) {
      for (const lat of [-70, -45, 0, 23, 52, 70]) {
        const origin = lonLatToCrs(crs, 10 + lat, lat) as [number, number];
        const scale = crsScaleAt(crs, origin);
        for (const size of [64, 128, 256, 512, 1024, 2048]) {
          for (const zoom of [3, 8, 12, 14, 15]) {
            for (let k = 0; k < 6; k++) {
              const centre: [number, number] = [(random() - 0.5) * 2e5, (random() - 0.5) * 2e5];
              const plan = planWindow({ crs, origin, scale, zoom, tileSize: SIZE, size, centre });
              worst = Math.max(worst, plan.tiles.length / maxTilesPerWindow(size, SIZE));
              expect(plan.tiles.length).toBeLessThanOrEqual(maxTilesPerWindow(size, SIZE));
            }
          }
        }
      }
    }
    expect(worst).toBeGreaterThan(0.4); // the bound is not absurdly loose
  });

  it('rejects windows beyond the largest size', () => {
    const crs: TileCrs = 'EPSG:3395';
    const origin = originFor(crs) as [number, number];
    expect(() => planWindow({ crs, origin, scale: crsScaleAt(crs, origin), zoom: 12, tileSize: SIZE, size: MAX_WINDOW_SIZE + 2, centre: [0, 0] })).toThrow(/at most/);
  });
});

describe('mixed-resolution continuity', () => {
  const tile = (value: number): DemTile => ({ size: SIZE, heights: new Float32Array(SIZE * SIZE).fill(value), min: value, max: value });
  // Zoom 1: only the western tile (0,0), at 100 m. Its eastern neighbour is missing. Zoom 0: everything, at 0 m.
  const lookup = (t: TileIndex) => (t.z === 1 && t.x === 0 && t.y === 0 ? tile(100) : t.z === 0 ? tile(0) : undefined);
  const sampler = () => new DemSampler(lookup, SIZE);

  it('has no jump across the edge of a fine tile whose neighbour has not loaded', () => {
    const s = sampler();
    let previous = s.sample(1, 240, 100);
    let worst = 0;
    for (let px = 240.05; px <= 275; px += 0.05) {
      const h = s.sample(1, px, 100);
      worst = Math.max(worst, Math.abs(h - previous));
      expect(h).toBeLessThanOrEqual(previous + 1e-9); // falls from 100 toward 0, never back up
      previous = h;
    }
    // The change per step is the slope of the transition (100 m over one pixel is 5 m per 0.05), not a step.
    expect(worst).toBeLessThanOrEqual(5.001);
    expect(s.sample(1, 240, 100)).toBe(100);
    expect(s.sample(1, 275, 100)).toBe(0);
  });

  it('has no jump along the edge either, where the fine tile ends to the south', () => {
    const s = sampler();
    let previous = s.sample(1, 100, 240);
    let worst = 0;
    for (let py = 240.05; py <= 275; py += 0.05) {
      const h = s.sample(1, 100, py);
      worst = Math.max(worst, Math.abs(h - previous));
      previous = h;
    }
    expect(worst).toBeLessThanOrEqual(5.001);
  });

  it('treats nodata like a missing tile: the pixel takes the coarser height', () => {
    const holed = tile(100);
    holed.heights[100 * SIZE + 100] = NaN;
    const s = new DemSampler((t) => (t.z === 1 && t.x === 0 && t.y === 0 ? holed : t.z === 0 ? tile(0) : undefined), SIZE);
    expect(s.sample(1, 100.5, 100.5)).toBe(0); // at the centre of the hole's pixel: pure coarse value
    expect(s.sample(1, 90.5, 100.5)).toBe(100);
  });

  it('is NaN only when no zoom has data', () => {
    expect(new DemSampler(() => undefined, SIZE).sample(3, 50, 50)).toBeNaN();
  });
});

describe('composeWindow', () => {
  /** Surface height at a texel, from its map position converted to spherical Mercator. */
  function expectedAt(crs: TileCrs, absX: number, absY: number): number {
    const [lon, lat] = crsToLonLat(crs, absX, absY);
    const [x, y] = lonLatToCrs('EPSG:3857', lon, lat);
    return steep(x, y);
  }

  for (const crs of ['EPSG:3857', 'EPSG:3395', 'EPSG:4326'] as const) {
    it(`reproduces the surface at every sample in ${crs}, across tile boundaries`, () => {
      const origin = originFor(crs) as [number, number];
      const scale = crsScaleAt(crs, origin);
      // Centre the window on a tile corner so it spans four tiles.
      const z = 12;
      const n = 2 ** z;
      const cornerLon = (Math.floor(((ORIGIN_LONLAT[0] + 180) / 360) * n) / n) * 360 - 180;
      const [cx, cy] = lonLatToCrs(crs, cornerLon, ORIGIN_LONLAT[1]);
      const plan = planWindow({ crs, origin, scale, zoom: z, tileSize: SIZE, size: 64, centre: [cx - origin[0], cy - origin[1]] });
      expect(plan.tiles.length).toBeGreaterThanOrEqual(2);

      const { lookup } = demLookup(() => true, steep);
      const { level, missing } = composeWindow(plan, lookup);
      expect(missing).toBe(0);
      expect(level).toMatchObject({ width: 64, height: 64, cellSizeX: plan.cellSizeX, cellSizeY: plan.cellSizeY });
      let worst = 0;
      for (let j = 0; j < 64; j++) {
        for (let i = 0; i < 64; i++) {
          const absX = origin[0] + level.originX + i * level.cellSizeX;
          const absY = origin[1] + level.originY + j * level.cellSizeY;
          worst = Math.max(worst, Math.abs(level.data[j * 64 + i]! - expectedAt(crs, absX, absY)));
        }
      }
      expect(worst).toBeLessThan(0.005);
    });
  }

  const crs: TileCrs = 'EPSG:3395';
  const origin = originFor(crs) as [number, number];
  const scale = crsScaleAt(crs, origin);
  const plan = planWindow({ crs, origin, scale, zoom: 12, tileSize: SIZE, size: 64, centre: [0, 0] });

  it('falls back to a coarser zoom where the finer tiles have not loaded', () => {
    const fine = composeWindow(plan, demLookup(() => true, steep).lookup);
    const coarse = composeWindow(plan, demLookup((tile) => tile.z === 11, steep).lookup);
    expect(coarse.missing).toBe(0);
    let worst = 0;
    fine.level.data.forEach((v, i) => { worst = Math.max(worst, Math.abs(v - coarse.level.data[i]!)); });
    expect(worst).toBeLessThan(0.005);
  });

  it('reads a distant ancestor when it is the only zoom with data', () => {
    const fine = composeWindow(plan, demLookup(() => true, steep).lookup);
    const only = composeWindow(plan, demLookup((tile) => tile.z === 8, steep).lookup);
    expect(only.missing).toBe(0);
    let worst = 0;
    fine.level.data.forEach((v, i) => { worst = Math.max(worst, Math.abs(v - only.level.data[i]!)); });
    expect(worst).toBeLessThan(0.05);
  });

  it('takes nodata pixels of a loaded tile from a coarser zoom', () => {
    const base = demLookup(() => true, steep).lookup;
    const holed = (tile: TileIndex) => {
      const value = base(tile);
      if (!value || tile.z !== 12) return value;
      const heights = value.heights.slice();
      for (let k = 0; k < heights.length; k += 7) heights[k] = NaN;
      return { ...value, heights };
    };
    const fine = composeWindow(plan, base);
    const result = composeWindow(plan, holed);
    expect(result.missing).toBe(0);
    result.level.data.forEach((v, i) => expect(Math.abs(v - fine.level.data[i]!)).toBeLessThan(0.005)); // coarse data is exact on this surface
  });

  it('fills samples no tile covers and counts them', () => {
    const none = composeWindow(plan, () => undefined, { fill: -7 });
    expect(none.missing).toBe(64 * 64);
    expect(none.level.data.every((v) => v === -7)).toBe(true);
    expect([none.min, none.max]).toEqual([0, 0]);

    const firstTile = plan.tiles[0]!;
    const partial = composeWindow(plan, demLookup((tile) => tile.x === firstTile.x && tile.y === firstTile.y, steep).lookup);
    if (plan.tiles.length > 1) {
      expect(partial.missing).toBeGreaterThan(0);
      expect(partial.missing).toBeLessThan(64 * 64);
    }
  });

  it('yields partial work privately and uses one tile snapshot across batches', () => {
    const tile = (height: number): DemTile => ({ size: SIZE, heights: new Float32Array(SIZE * SIZE).fill(height), min: height, max: height });
    let current = tile(10);
    const steps = composeWindowSteps(plan, () => current);
    let step = steps.next();
    expect(step.done).toBe(false);
    current = tile(90); // a replacement arrives while this window is composing
    let batches = 1;
    while (!step.done) { step = steps.next(); batches++; }
    expect(batches).toBe(16);
    expect(step.value.level.data.every(value => value === 10)).toBe(true);
    expect(composeWindow(plan, () => current).level.data.every(value => value === 90)).toBe(true);
  });

  it('multiplies heights by the vertical scale and reports the range after scaling', () => {
    const { lookup } = demLookup(() => true, steep);
    const one = composeWindow(plan, lookup);
    const three = composeWindow(plan, lookup, { verticalScale: 3 });
    expect(three.min).toBeCloseTo(one.min * 3, 3);
    expect(three.max).toBeCloseTo(one.max * 3, 3);
    expect(three.level.data[100]).toBeCloseTo(one.level.data[100]! * 3, 3);
    expect(one.min).toBeLessThan(one.max);
  });

  it('is a level the height lookup can read', () => {
    const { level } = composeWindow(plan, demLookup(() => true, steep).lookup);
    const source = { levels: [level], bounds: [0, 0, 1, 1] as [number, number, number, number], minHeight: 0, maxHeight: 0 };
    const x = level.originX + 10.5 * level.cellSizeX;
    const y = level.originY + 20.5 * level.cellSizeY;
    const expected = expectedAt(crs, origin[0] + x, origin[1] + y);
    expect(heightAt(source, x, y)).toBeCloseTo(expected, 3);
  });
});
