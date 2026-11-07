import { describe, expect, it } from 'vitest';
import { Camera } from '@urban-toolkit/autk-core';
import { selectTiles } from '../src/tile-selection';
import type { TileView } from '../src/tile-selection';
import { lonLatToCrs, crsToLonLat, EARTH_RADIUS } from '../src/tile-projection';
import { lonLatToTileCoord } from '../src/tile-index';
import { resolveTileSource } from '../src/tile-source';

const SOURCE = resolveTileSource({ urlTemplate: 'https://t/{z}/{x}/{y}', attribution: 'a', maxZoom: 19 });
const LON = -43.2;
const LAT = -22.9;
const ORIGIN = lonLatToCrs('EPSG:3857', LON, LAT);
const FOV = 45;
const W = 1600;
const H = 1000;

/** A camera looking straight down from `eye`, tilted towards the horizon by `tilt` radians. */
function makeCamera(eye: [number, number, number], tilt = 0): Camera {
    const camera = new Camera({ eye, lookAt: [eye[0], eye[1], 0], up: [0, 1, 0] });
    camera.pitch(-tilt); // negative pitch leans the view towards the horizon
    camera.resize(W, H);
    camera.update();
    return camera;
}

function view(eye: [number, number, number], tilt = 0, extra: Partial<TileView> = {}): TileView {
    return { camera: makeCamera(eye, tilt), origin: ORIGIN, crs: 'EPSG:3857', ...extra };
}

const topDown = (height: number) => view([0, 0, height]);

// Mercator metres covered by one pixel for a top-down camera.
const mercatorPixel = (height: number) => (2 * height * Math.tan((FOV / 2) * (Math.PI / 180))) / H;
const expectedZoom = (height: number) => Math.round(Math.log2((2 * Math.PI * EARTH_RADIUS) / (256 * mercatorPixel(height))));

describe('selectTiles', () => {
  it('picks the zoom whose tile pixel matches the screen pixel', () => {
    for (const height of [300, 1200, 5000, 40000]) {
      const sel = selectTiles(topDown(height), SOURCE, { maxTiles: 10000 })!;
      expect(sel.z).toBe(expectedZoom(height));
    }
  });

  it('goes one zoom level deeper each time the camera halves its height', () => {
    const a = selectTiles(topDown(8000), SOURCE, { maxTiles: 10000 })!;
    const b = selectTiles(topDown(4000), SOURCE, { maxTiles: 10000 })!;
    expect(b.z).toBe(a.z + 1);
  });

  it('honours zoomBias', () => {
    const base = selectTiles(topDown(4000), SOURCE, { maxTiles: 10000 })!;
    expect(selectTiles(topDown(4000), SOURCE, { maxTiles: 10000, zoomBias: 1 })!.z).toBe(base.z + 1);
    expect(selectTiles(topDown(4000), SOURCE, { maxTiles: 10000, zoomBias: -1 })!.z).toBe(base.z - 1);
  });

  it('lists the tile under the view centre first and covers the whole footprint', () => {
    const sel = selectTiles(topDown(2000), SOURCE, { maxTiles: 10000 })!;
    const c = lonLatToTileCoord(LON, LAT, sel.z);
    expect(sel.tiles[0]).toEqual({ z: sel.z, x: Math.floor(c.x), y: Math.floor(c.y) });
    expect(sel.bounds.west).toBeLessThan(LON);
    expect(sel.bounds.east).toBeGreaterThan(LON);
    expect(sel.bounds.south).toBeLessThan(LAT);
    expect(sel.bounds.north).toBeGreaterThan(LAT);
    for (const t of sel.tiles) expect(t.z).toBe(sel.z);
    expect(new Set(sel.tiles.map((t) => `${t.x}/${t.y}`)).size).toBe(sel.tiles.length);
  });

  it('lowers the zoom until the tile count fits the cap', () => {
    const free = selectTiles(topDown(2000), SOURCE, { maxTiles: 100000 })!;
    expect(free.tiles.length).toBeGreaterThan(6);
    const capped = selectTiles(topDown(2000), SOURCE, { maxTiles: 6 })!;
    expect(capped.tiles.length).toBeLessThanOrEqual(6);
    expect(capped.z).toBeLessThan(free.z);
  });

  it('stays inside the source zoom range', () => {
    const narrow = resolveTileSource({ urlTemplate: 'https://t/{z}/{x}/{y}', attribution: 'a', minZoom: 4, maxZoom: 9 });
    expect(selectTiles(topDown(50), narrow, { maxTiles: 10000 })!.z).toBe(9);
    expect(selectTiles(topDown(5e7), narrow, { maxTiles: 10000 })!.z).toBe(4);
  });

  it('handles a tilted camera that sees the horizon without exploding', () => {
    const v = view([0, 0, 600], 0.9);
    const sel = selectTiles(v, SOURCE)!;
    expect(sel).not.toBeNull();
    expect(sel.tiles.length).toBeGreaterThan(0);
    expect(sel.tiles.length).toBeLessThanOrEqual(64);
    for (const v of [sel.bounds.west, sel.bounds.east, sel.bounds.south, sel.bounds.north]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('gives the same zoom for the same view in EPSG:3395', () => {
    const origin = lonLatToCrs('EPSG:3395', LON, LAT);
    const a = selectTiles(topDown(3000), SOURCE, { maxTiles: 10000 })!;
    const b = selectTiles({ ...topDown(3000), crs: 'EPSG:3395', origin }, SOURCE, { maxTiles: 10000 })!;
    expect(b.z).toBe(a.z);
    expect(b.tiles[0]).toEqual(a.tiles[0]);
  });

  it('returns null for an empty viewport', () => {
    const camera = new Camera({ eye: [0, 0, 1000], lookAt: [0, 0, 0], up: [0, 1, 0] });
    camera.update();
    expect(selectTiles({ camera, origin: ORIGIN, crs: 'EPSG:3857' }, SOURCE)).toBeNull();
  });

  it('returns null when the camera looks away from the ground', () => {
    // Pitched past the horizon: the whole screen points at the sky.
    expect(selectTiles(view([0, 0, 100], 2.2), SOURCE)).toBeNull();
  });
});

// ── Regressions from the review ──────────────────────────────────────────────

describe('selectTiles is bounded and covers the visible ground', () => {
  const MIN16 = resolveTileSource({ urlTemplate: 'https://t/{z}/{x}/{y}', attribution: 'a', minZoom: 16, maxZoom: 19 });

  it('never returns more than maxTiles, even at the source minimum zoom', () => {
    const sel = selectTiles(topDown(5000), MIN16, { maxTiles: 64 })!;
    expect(sel.tiles.length).toBeLessThanOrEqual(64);
    expect(sel.z).toBe(16);
    expect(sel.truncated).toBe(true);
  });

  it('keeps the tiles nearest the view centre when it has to truncate', () => {
    const sel = selectTiles(topDown(5000), MIN16, { maxTiles: 9 })!;
    const c = lonLatToTileCoord(LON, LAT, 16);
    expect(sel.tiles.length).toBeLessThanOrEqual(9);
    expect(sel.tiles.length).toBeGreaterThanOrEqual(8); // most of the budget is used
    expect(sel.tiles[0]).toEqual({ z: 16, x: Math.floor(c.x), y: Math.floor(c.y) });
    for (const t of sel.tiles) {
      expect(Math.abs(t.x + 0.5 - c.x)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(t.y + 0.5 - c.y)).toBeLessThanOrEqual(2.5);
    }
  });

  it('does not enumerate a huge footprint to enforce the cap', () => {
    // At zoom 19 this footprint holds tens of millions of tiles.
    const min19 = resolveTileSource({ urlTemplate: 'https://t/{z}/{x}/{y}', attribution: 'a', minZoom: 19, maxZoom: 19 });
    const started = performance.now();
    const sel = selectTiles(topDown(200000), min19, { maxTiles: 64 })!;
    expect(performance.now() - started).toBeLessThan(250);
    expect(sel.tiles.length).toBeLessThanOrEqual(64);
    expect(sel.tiles.length).toBeGreaterThan(0);
    expect(sel.truncated).toBe(true);
  });

  it('reports the zoom the view wanted when the cap made it coarser', () => {
    const free = selectTiles(topDown(2000), SOURCE, { maxTiles: 100000 })!;
    expect(free.wantedZoom).toBe(free.z);
    const capped = selectTiles(topDown(2000), SOURCE, { maxTiles: 6 })!;
    expect(capped.wantedZoom).toBe(free.z);
    expect(capped.z).toBeLessThan(capped.wantedZoom);
  });

  it('keeps the wanted zoom within the source range', () => {
    const narrow = resolveTileSource({ urlTemplate: 'https://t/{z}/{x}/{y}', attribution: 'a', minZoom: 4, maxZoom: 9 });
    expect(selectTiles(topDown(50), narrow, { maxTiles: 10000 })!.wantedZoom).toBe(9);
    expect(selectTiles(topDown(5e7), narrow, { maxTiles: 10000 })!.wantedZoom).toBe(4);
  });

  it('stays under the cap with a large positive zoomBias', () => {
    const sel = selectTiles(topDown(3000), SOURCE, { maxTiles: 20, zoomBias: 8 })!;
    expect(sel.tiles.length).toBeLessThanOrEqual(20);
  });

  it('does not flag or trim a view whose full coverage fits', () => {
    const sel = selectTiles(topDown(3000), SOURCE, { maxTiles: 1000 })!;
    expect(sel.truncated).toBe(false);
    const full = selectTiles(topDown(3000), SOURCE, { maxTiles: 100000 })!;
    expect(sel.tiles).toHaveLength(full.tiles.length);
  });

  it('ignores tuning values that would defeat the bounds', () => {
    for (const bad of [NaN, -5, 0, Infinity]) {
      const sel = selectTiles(topDown(3000), SOURCE, { maxTiles: bad, zoomBias: bad, maxDistanceInHeights: bad })!;
      expect(sel).not.toBeNull();
      expect(sel.tiles.length).toBeLessThanOrEqual(64);
      expect(Number.isInteger(sel.z)).toBe(true);
    }
  });

  // The camera from the review: almost level, so the horizon is in view.
  function horizonCamera(yaw: number): Camera {
    const d = Math.hypot(20, 1100);
    const camera = new Camera({ eye: [0, -100, 100], lookAt: [0, 1000, 80], up: [0, 20 / d, 1100 / d] });
    camera.yaw(yaw);
    camera.resize(W, H);
    camera.update();
    return camera;
  }

  for (const yaw of [0, 0.7, -2.2]) {
    it(`selects the tile of every visible ground point within reach near the horizon (yaw ${yaw})`, () => {
      const camera = horizonCamera(yaw);
      const eye = camera.getEye();
      const reach = 20 * Math.abs(eye[2]);
      const sel = selectTiles({ camera, origin: ORIGIN, crs: 'EPSG:3857' }, SOURCE, { maxTiles: 5000 })!;
      expect(sel.truncated).toBe(false);
      const chosen = new Set(sel.tiles.map((t) => `${t.x}/${t.y}`));

      let checked = 0;
      for (let i = 0; i <= 40; i++) {
        for (let j = 0; j <= 40; j++) {
          const x = i / 40;
          const y = j / 40;
          const d = camera.getWorldRayDirection(x, y);
          if (d[2] >= -1e-6) continue; // never reaches the ground
          const t = -eye[2] / d[2];
          const hit: [number, number] = [eye[0] + d[0] * t, eye[1] + d[1] * t];
          if (Math.hypot(hit[0] - eye[0], hit[1] - eye[1]) > reach) continue; // beyond the reach limit
          const [lon, lat] = crsToLonLat('EPSG:3857', hit[0] + ORIGIN[0], hit[1] + ORIGIN[1]);
          const c = lonLatToTileCoord(lon, lat, sel.z);
          expect(chosen.has(`${Math.floor(c.x)}/${Math.floor(c.y)}`)).toBe(true);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(100);
    });
  }
});
