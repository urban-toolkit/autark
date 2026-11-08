import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DemTile } from '../src/dem-decode';
import { TileHeightSource } from '../src/height-source-tiles';
import type { TileHeightSourceOptions } from '../src/height-source-tiles';
import { isStreamingHeightSource } from '../src/height-source';
import { TERRAIN_TILE_SOURCES, resolveTerrainTileSource } from '../src/terrain-tile-source';
import type { TerrainTileSource } from '../src/terrain-tile-source';
import type { TileIndex } from '../src/tile-index';
import { WEB_MERCATOR_EXTENT, crsToLonLat, lonLatToCrs } from '../src/tile-projection';

const SIZE = 256;
const CRS = 'EPSG:3395' as const;
const ORIGIN = lonLatToCrs(CRS, -43.1, -22.9) as [number, number];
const [OX, OY] = lonLatToCrs('EPSG:3857', -43.1, -22.9);
/** Linear in spherical Mercator position, measured from the origin, so bilinear sampling is exact. */
const surface = (x: number, y: number) => 0.02 * (x - OX) + 0.04 * (y - OY);

function demTile(tile: TileIndex): DemTile {
  const pm = (2 * WEB_MERCATOR_EXTENT) / (SIZE * 2 ** tile.z);
  const heights = new Float32Array(SIZE * SIZE);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      heights[j * SIZE + i] = surface(-WEB_MERCATOR_EXTENT + (tile.x * SIZE + i + 0.5) * pm, WEB_MERCATOR_EXTENT - (tile.y * SIZE + j + 0.5) * pm);
    }
  }
  return { size: SIZE, heights, min: Math.min(...heights), max: Math.max(...heights) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const resolved = resolveTerrainTileSource(TERRAIN_TILE_SOURCES.awsTerrarium);

function make(extra: Partial<TileHeightSourceOptions> = {}) {
  const requested: TileIndex[] = [];
  const signals: AbortSignal[] = [];
  const onChange = vi.fn();
  const source = new TileHeightSource({
    source: resolved,
    crs: CRS,
    origin: ORIGIN,
    centre: [0, 0],
    windowSize: 64,
    // The default budget would make these tests depend on how fast the machine is.
    composeBudgetMs: Infinity,
    onChange,
    load: async (url, signal) => {
      const [, z, x, y] = /\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url)!.map(Number) as [number, number, number, number];
      requested.push({ z, x, y });
      signals.push(signal);
      return demTile({ z, x, y });
    },
    ...extra,
  });
  return { source, requested, signals, onChange };
}

afterEach(() => vi.useRealTimers());

describe('TerrainTileSource', () => {
  it('resolves the preset and rejects an unknown encoding', () => {
    expect(resolved).toMatchObject({ encoding: 'terrarium', tileSize: 256, minZoom: 0, maxZoom: 15 });
    expect(() => resolveTerrainTileSource({ ...TERRAIN_TILE_SOURCES.awsTerrarium, encoding: 'rgb' } as unknown as TerrainTileSource)).toThrow(/encoding/);
  });
});

describe('TileHeightSource', () => {
  it('is a valid flat source before anything loads, with one window per zoom from 14 down', () => {
    const { source } = make();
    expect(isStreamingHeightSource(source)).toBe(true);
    expect(source.levels).toHaveLength(6);
    expect(source.stats.zooms).toEqual([14, 13, 12, 11, 10, 9]);
    for (const level of source.levels) {
      expect(level).toMatchObject({ width: 64, height: 64 });
      expect(level.data.every((v) => v === 0)).toBe(true);
    }
    expect(source.version).toBeGreaterThan(0);
    expect(source.stats.wantedTiles).toBeGreaterThan(0);
    expect(source.stats.readyTiles).toBe(0);
    expect(source.stats.idle).toBe(false);
    source.destroy();
  });

  it('doubles the cell size and extent from one level to the next, and the terrain is the outermost window', () => {
    const { source } = make();
    for (let k = 1; k < source.levels.length; k++) {
      expect(source.levels[k]!.cellSizeX / source.levels[k - 1]!.cellSizeX).toBeCloseTo(2, 9);
    }
    const outer = source.levels[source.levels.length - 1]!;
    expect(source.bounds[0]).toBe(outer.originX);
    expect(source.bounds[2]).toBeCloseTo(outer.originX + 63 * outer.cellSizeX, 6);
    source.destroy();
  });

  it('requests the coarsest level first', async () => {
    const { source, requested } = make();
    await flush();
    expect(requested.length).toBeGreaterThan(0);
    expect(requested[0]!.z).toBe(9);
    source.destroy();
  });

  it('tells the map when a tile arrives, then composes the surface', async () => {
    const { source, onChange } = make();
    const before = source.version;
    await flush();
    expect(onChange).toHaveBeenCalled();

    source.update([0, 0]);
    expect(source.version).toBeGreaterThan(before);
    expect(source.stats.readyTiles).toBe(source.stats.wantedTiles);
    expect(source.stats.missingSamples.every((m) => m === 0)).toBe(true);
    expect(source.stats.idle).toBe(true);

    // The finest window reproduces the analytic surface at a sample and between samples.
    const fine = source.levels[0]!;
    for (const [i, j] of [[10, 12], [31, 31], [50.5, 20.25]] as const) {
      const x = fine.originX + i * fine.cellSizeX;
      const y = fine.originY + j * fine.cellSizeY;
      const [lon, lat] = crsToLonLat(CRS, ORIGIN[0] + x, ORIGIN[1] + y);
      const [mx, my] = lonLatToCrs('EPSG:3857', lon, lat);
      expect(source.heightAt(x, y)).toBeCloseTo(surface(mx, my), 2);
    }
    source.destroy();
  });

  it('reports a range that covers the surface, and includes 0 while samples are missing', async () => {
    const { source } = make();
    expect(source.minHeight).toBe(0);
    expect(source.maxHeight).toBe(0);
    await flush();
    source.update([0, 0]);
    const all = source.levels.flatMap((l) => Array.from(l.data));
    expect(source.minHeight).toBeLessThanOrEqual(Math.min(...all));
    expect(source.maxHeight).toBeGreaterThanOrEqual(Math.max(...all));
    expect(source.maxHeight).toBeGreaterThan(source.minHeight);
    source.destroy();
  });

  it('does no work when nothing changed or the view moved less than a sample', async () => {
    const { source } = make();
    await flush();
    source.update([0, 0]);
    const version = source.version;
    const versions = [...source.levelVersions];
    source.update([0, 0]);
    source.update([source.levels[0]!.cellSizeX * 0.3, source.levels[0]!.cellSizeY * -0.3]);
    expect(source.version).toBe(version);
    expect(source.levelVersions).toEqual(versions);
    source.destroy();
  });

  it('recomposes only the levels whose window moved', async () => {
    const { source } = make();
    await flush();
    source.update([0, 0]);
    await flush();
    source.update([0, 0]);
    const versions = [...source.levelVersions];
    const cell = source.levels[0]!.cellSizeX;
    source.update([cell, 0]); // one finest sample: the finest window moves, the coarsest does not
    expect(source.levelVersions[0]).toBeGreaterThan(versions[0]!);
    expect(source.levelVersions[source.levels.length - 1]).toBe(versions[versions.length - 1]);
    source.destroy();
  });

  it('does not recompose a complete level when only a coarser tile arrives', async () => {
    const held: Array<() => void> = [];
    const coarsest = 9;
    const { source } = make({
      load: (url) => {
        const [, z, x, y] = /\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url)!.map(Number) as [number, number, number, number];
        const tile = demTile({ z, x, y });
        if (z !== coarsest) return Promise.resolve(tile);
        return new Promise((resolve) => held.push(() => resolve(tile)));
      },
    });
    await flush();
    await flush();
    source.update([0, 0]);
    expect(source.stats.zooms.at(-1)).toBe(coarsest);
    const versions = [...source.levelVersions];
    expect(held.length).toBeGreaterThan(0);
    held.forEach((release) => release());
    await flush();
    source.update([0, 0]);
    // The coarsest level gained its tiles; the finest was already complete and is untouched.
    expect(source.levelVersions.at(-1)).toBeGreaterThan(versions.at(-1)!);
    expect(source.levelVersions[0]).toBe(versions[0]);
    source.destroy();
  });

  it('raises the cache to what the windows can need, so tiles in use are never evicted', () => {
    const { source } = make({ maxCachedTiles: 1, windowSize: 512 });
    const stats = source.stats;
    expect(stats.tileBound).toBe(stats.levels * 16); // 16 tiles per 512-sample window at 256 pixels
    expect(stats.cacheLimit).toBeGreaterThanOrEqual(stats.tileBound);
    expect(stats.wantedTiles).toBeLessThanOrEqual(stats.tileBound);
    const tile = 256 * 256 * 4;
    expect(stats.memory.decodedTiles).toBe(stats.cacheLimit * tile);
    expect(stats.memory.cpuWindows).toBe(stats.levels * stats.windowSize ** 2 * 4);
    expect(stats.memory.gpuHeights).toBe(stats.memory.cpuWindows);
    expect(stats.memory.decoding).toBe(8 * 2 * tile);
    expect(stats.memory.total).toBe(stats.memory.decodedTiles + 2 * stats.memory.cpuWindows + stats.memory.decoding);
    source.destroy();
  });

  it('keeps a larger cache that the caller asks for', () => {
    const { source } = make({ maxCachedTiles: 5000 });
    expect(source.stats.cacheLimit).toBe(5000);
    source.destroy();
  });

  it('rejects a coordinate system in degrees', () => {
    expect(() => make({ crs: 'EPSG:4326' })).toThrow(/metre-based/);
  });

  it('fills nodata in a complete fine level when the coarser tiles arrive later', async () => {
    const held: Array<() => void> = [];
    const nodata: DemTile = { size: SIZE, heights: new Float32Array(SIZE * SIZE).fill(NaN), min: 0, max: 0 };
    const coarseTile: DemTile = { size: SIZE, heights: new Float32Array(SIZE * SIZE).fill(123), min: 123, max: 123 };
    const { source } = make({
      levels: 2,
      load: (url) => {
        const z = Number(/\/(\d+)\/\d+\/\d+\.png$/.exec(url)![1]);
        if (z === 14) return Promise.resolve(nodata); // the finest level: every tile loads, with no data
        return new Promise((resolve) => held.push(() => resolve(coarseTile)));
      },
    });
    await flush();
    await flush();
    source.update([0, 0]);
    // Every tile of the finest level is ready, yet none of its samples has a value.
    expect(source.stats.zooms).toEqual([14, 13]);
    expect(source.stats.missingSamples[0]).toBe(64 * 64);
    expect(source.heightAt(0, 0)).toBe(0);

    held.forEach((release) => release());
    await flush();
    source.update([0, 0]);
    // The coarse tiles have arrived; the finest level must use them, without any movement of the view.
    expect(source.stats.missingSamples[0]).toBe(0);
    expect(source.heightAt(0, 0)).toBeCloseTo(123, 3);
    source.destroy();
  });

  it('requests new tiles when the view moves far, and keeps what it already has', async () => {
    const { source, requested } = make();
    await flush();
    source.update([0, 0]);
    const first = requested.length;
    source.update([200_000, 150_000]);
    await flush();
    expect(requested.length).toBeGreaterThan(first);
    source.destroy();
  });

  it('uses fewer levels when the source has too few zooms', () => {
    const narrow = resolveTerrainTileSource({ ...TERRAIN_TILE_SOURCES.awsTerrarium, minZoom: 8, maxZoom: 10 });
    const { source } = make({ source: narrow });
    expect(source.stats.zooms).toEqual([10, 9, 8]);
    expect(source.levels).toHaveLength(3);
    source.destroy();
  });

  it('lets the zoom bias, level count and vertical scale be chosen', async () => {
    const coarse = make({ zoomBias: -2, levels: 3 });
    expect(coarse.source.stats.zooms).toEqual([12, 11, 10]);
    coarse.source.destroy();

    const one = make();
    const three = make({ verticalScale: 3 });
    await flush();
    one.source.update([0, 0]);
    three.source.update([0, 0]);
    expect(three.source.maxHeight).toBeCloseTo(one.source.maxHeight * 3, 2);
    expect(three.source.heightAt(0, 0)).toBeCloseTo(one.source.heightAt(0, 0) * 3, 2);
    one.source.destroy();
    three.source.destroy();
  });

  it('stops loading when destroyed', async () => {
    const { source, signals } = make();
    source.destroy();
    await flush();
    expect(signals.every((s) => s.aborted) || signals.length === 0).toBe(true);
  });

  it('rejects an odd or tiny window', () => {
    expect(() => make({ windowSize: 63 })).toThrow(/even/);
    expect(() => make({ windowSize: 2 })).toThrow(/even/);
  });
});

describe('compose budget', () => {
  /** Every call to the clock advances it by `step` milliseconds, so each composition costs exactly `step`. */
  function slowClock(step: number) {
    let t = 0;
    return vi.spyOn(performance, 'now').mockImplementation(() => (t += step));
  }

  afterEach(() => vi.restoreAllMocks());

  it('composes every level the first time, whatever the budget', () => {
    slowClock(10);
    const { source } = make({ levels: 3, composeBudgetMs: 4 });
    expect(source.levels).toHaveLength(3);
    expect(source.levels.every((level) => level.data.length > 0)).toBe(true);
    expect(source.stats.pendingLevels).toBe(0);
    source.destroy();
  });

  it('composes one out-of-date level per frame when each costs more than the budget, coarsest first, and asks for the next frame', () => {
    slowClock(10);
    const { source, onChange } = make({ levels: 3, composeBudgetMs: 4 });
    onChange.mockClear();
    const before = [...source.levelVersions];
    const far = 50 * source.levels[2]!.cellSizeX * 64; // far enough that every level moves

    source.update([far, far]);
    expect(source.stats.pendingLevels).toBe(2);
    expect(onChange).toHaveBeenCalled();
    expect(source.levelVersions.map((v, k) => v > before[k]!)).toEqual([false, false, true]);

    source.update([far, far]);
    expect(source.stats.pendingLevels).toBe(1);
    expect(source.levelVersions.map((v, k) => v > before[k]!)).toEqual([false, true, true]);

    source.update([far, far]);
    expect(source.stats.pendingLevels).toBe(0);
    expect(source.levelVersions.every((v, k) => v > before[k]!)).toBe(true);
    expect(source.stats.idle).toBe(false); // tiles are still loading, but nothing waits for composition
    source.destroy();
  });

  it('does not starve a fine level that moves every frame', () => {
    slowClock(10);
    const { source } = make({ levels: 2, composeBudgetMs: 4 });
    const step = 2 * source.levels[1]!.cellSizeX; // moves both levels' lattices every update
    let fine = 0;
    let coarse = 0;
    for (let i = 1; i <= 8; i++) {
      const [f, c] = [source.levelVersions[0]!, source.levelVersions[1]!];
      source.update([i * step, 0]);
      if (source.levelVersions[0]! > f) fine++;
      if (source.levelVersions[1]! > c) coarse++;
    }
    expect(fine).toBe(4);
    expect(coarse).toBe(4);
    source.destroy();
  });

  it('spends the whole budget on several cheap levels in one frame', () => {
    slowClock(0.5); // each composition costs 0.5 ms, so the budget of 4 ms covers all three
    const { source } = make({ levels: 3, composeBudgetMs: 4 });
    const before = [...source.levelVersions];
    const far = 50 * source.levels[2]!.cellSizeX * 64;
    source.update([far, far]);
    expect(source.stats.pendingLevels).toBe(0);
    expect(source.levelVersions.every((v, k) => v > before[k]!)).toBe(true);
    source.destroy();
  });
});
