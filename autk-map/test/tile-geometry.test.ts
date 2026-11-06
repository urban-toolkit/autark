import { describe, expect, it } from 'vitest';
import { buildTileGrid, tileRowCount } from '../src/tile-geometry';
import { tilesPerAxis } from '../src/tile-index';
import { TILE_CRS_VALUES, WEB_MERCATOR_EXTENT, lonLatToCrs, mercatorYToLat } from '../src/tile-projection';
import type { TileCrs } from '../src/tile-projection';

/** A real Esri z17 tile; corners in EPSG:3395 computed by PROJ through `gdaltransform`. */
const LAGOS = { z: 17, x: 66500, y: 63177 };
const LAGOS_NW_3395 = [294741.18106764, 716451.752437051];
const LAGOS_SE_3395 = [295046.92918078, 716148.025347883];

describe('buildTileGrid', () => {
  it('places the corners where PROJ puts them, relative to the origin', () => {
    const origin = [295000, 716000] as const;
    const grid = buildTileGrid(LAGOS, 'EPSG:3395', origin);
    expect(grid.rows).toBe(1);
    // Vertex order: north-west, north-east, south-west, south-east.
    expect(grid.positions[0]).toBeCloseTo(LAGOS_NW_3395[0]! - origin[0], 2);
    expect(grid.positions[1]).toBeCloseTo(LAGOS_NW_3395[1]! - origin[1], 2);
    expect(grid.positions[6]).toBeCloseTo(LAGOS_SE_3395[0]! - origin[0], 2);
    expect(grid.positions[7]).toBeCloseTo(LAGOS_SE_3395[1]! - origin[1], 2);
  });

  it('shifts every position by the change of origin', () => {
    const a = buildTileGrid(LAGOS, 'EPSG:3395', [0, 0]);
    const b = buildTileGrid(LAGOS, 'EPSG:3395', [100, -50]);
    for (let i = 0; i < a.positions.length; i += 2) {
      expect(a.positions[i]! - b.positions[i]!).toBeCloseTo(100, 1);
      expect(a.positions[i + 1]! - b.positions[i + 1]!).toBeCloseTo(-50, 1);
    }
  });

  it('keeps the world tile square in EPSG:3857', () => {
    const grid = buildTileGrid({ z: 0, x: 0, y: 0 }, 'EPSG:3857', [0, 0]);
    expect(Array.from(grid.positions)).toEqual([
      -WEB_MERCATOR_EXTENT, WEB_MERCATOR_EXTENT, WEB_MERCATOR_EXTENT, WEB_MERCATOR_EXTENT,
      -WEB_MERCATOR_EXTENT, -WEB_MERCATOR_EXTENT, WEB_MERCATOR_EXTENT, -WEB_MERCATOR_EXTENT,
    ].map(Math.fround));
  });

  it('uses degrees in EPSG:4326', () => {
    const grid = buildTileGrid({ z: 1, x: 0, y: 0 }, 'EPSG:4326', [0, 0]);
    expect(grid.positions[0]).toBe(-180);
    expect(grid.positions[2]).toBeCloseTo(0, 9);
    expect(grid.positions[1]).toBeCloseTo(mercatorYToLat(WEB_MERCATOR_EXTENT), 4);
    expect(grid.positions[grid.positions.length - 1]).toBeCloseTo(0, 4);
  });

  it('samples the texture linearly from north (v = 0) to south (v = 1)', () => {
    const grid = buildTileGrid({ z: 2, x: 1, y: 1 }, 'EPSG:4326', [0, 0]);
    const rows = grid.rows;
    expect(rows).toBe(64);
    expect(grid.texCoords.length).toBe((rows + 1) * 4);
    expect(Array.from(grid.texCoords.slice(0, 4))).toEqual([0, 0, 1, 0]);
    expect(Array.from(grid.texCoords.slice(-4))).toEqual([0, 1, 1, 1]);
    expect(grid.texCoords[(rows / 2) * 4 + 1]).toBe(0.5);
  });

  it('indexes two triangles per row, all inside the vertex range', () => {
    const grid = buildTileGrid({ z: 0, x: 0, y: 0 }, 'EPSG:4326', [0, 0]);
    expect(grid.indices.length).toBe(grid.rows * 6);
    const vertexCount = grid.positions.length / 2;
    expect(vertexCount).toBe((grid.rows + 1) * 2);
    expect(Math.max(...grid.indices)).toBe(vertexCount - 1);
    expect(Array.from(buildTileGrid(LAGOS, 'EPSG:3395', [0, 0]).indices)).toEqual([0, 1, 2, 1, 3, 2]);
  });

  describe.each(TILE_CRS_VALUES)('neighbouring tiles in %s', (crs) => {
    const origin = [0, 0] as const;

    it.each([0, 1, 3, 8, 17])('share their vertical edge exactly at zoom %i', (z) => {
      const n = tilesPerAxis(z);
      const x = Math.min(n - 2, 5);
      const left = buildTileGrid({ z, x, y: 0 }, crs, origin);
      const right = buildTileGrid({ z, x: x + 1, y: 0 }, crs, origin);
      expect(left.rows).toBe(right.rows);
      for (let r = 0; r <= left.rows; r++) {
        // East vertex of the left tile equals west vertex of the right tile.
        expect(left.positions[r * 4 + 2]).toBe(right.positions[r * 4]);
        expect(left.positions[r * 4 + 3]).toBe(right.positions[r * 4 + 1]);
      }
    });

    it.each([0, 1, 3, 8, 17])('share their horizontal edge exactly at zoom %i', (z) => {
      const n = tilesPerAxis(z);
      const y = Math.min(n - 2, 4);
      const above = buildTileGrid({ z, x: 0, y }, crs, origin);
      const below = buildTileGrid({ z, x: 0, y: y + 1 }, crs, origin);
      const lastRow = above.rows * 4;
      for (let i = 0; i < 4; i++) {
        expect(above.positions[lastRow + i]).toBe(below.positions[i]);
      }
    });
  });
});

describe('tileRowCount', () => {
  it('uses one row for Web Mercator and for 3395 from zoom 5', () => {
    for (let z = 0; z <= 22; z++) expect(tileRowCount('EPSG:3857', z)).toBe(1);
    expect(tileRowCount('EPSG:3395', 0)).toBe(4);
    expect(tileRowCount('EPSG:3395', 5)).toBe(1);
    expect(tileRowCount('EPSG:3395', 17)).toBe(1);
  });

  it('splits EPSG:4326 tiles more at low zoom, never fewer at lower zoom', () => {
    let previous = Infinity;
    for (let z = 0; z <= 22; z++) {
      const rows = tileRowCount('EPSG:4326', z);
      expect(rows).toBeLessThanOrEqual(previous);
      previous = rows;
    }
    expect(tileRowCount('EPSG:4326', 0)).toBe(64);
    expect(tileRowCount('EPSG:4326', 12)).toBe(1);
  });

  /**
   * Largest gap, in pixels of a 512-pixel tile, between the true map y of a
   * latitude inside a tile and the y that linear interpolation between the
   * tile's row vertices gives.
   */
  function worstErrorPixels(crs: TileCrs, z: number, rows = tileRowCount(crs, z)): number {
    const n = tilesPerAxis(z);
    const size = (2 * WEB_MERCATOR_EXTENT) / n;
    const step = Math.max(1, Math.floor(n / 256));
    let worst = 0;
    const tileRows = new Set<number>([0, n - 1]);
    for (let ty = 0; ty < n; ty += step) tileRows.add(ty);
    for (const ty of tileRows) {
      const yAt = (v: number) => lonLatToCrs(crs, 0, mercatorYToLat(WEB_MERCATOR_EXTENT - (ty + v) * size))[1];
      const perPixel = Math.abs(yAt(0) - yAt(1)) / 512;
      if (perPixel === 0) continue;
      for (let k = 0; k <= 64; k++) {
        const v = k / 64;
        const r = Math.min(rows - 1, Math.floor(v * rows));
        const v0 = r / rows;
        const v1 = (r + 1) / rows;
        const interpolated = yAt(v0) + (yAt(v1) - yAt(v0)) * ((v - v0) / (v1 - v0));
        worst = Math.max(worst, Math.abs(interpolated - yAt(v)) / perPixel);
      }
    }
    return worst;
  }

  it.each(TILE_CRS_VALUES)('keeps the drawn tile within 1/8 pixel of the true projection in %s', (crs) => {
    for (let z = 0; z <= 22; z++) {
      expect(worstErrorPixels(crs, z), `${crs} zoom ${z}`).toBeLessThan(0.125);
    }
  });

  it('would exceed that bound with a single row where the table splits tiles', () => {
    expect(worstErrorPixels('EPSG:4326', 0, 1)).toBeGreaterThan(1);
    expect(worstErrorPixels('EPSG:4326', 8, 1)).toBeGreaterThan(0.125);
    expect(worstErrorPixels('EPSG:3395', 0, 1)).toBeGreaterThan(0.125);
    // And one row is already enough where the table uses one.
    expect(worstErrorPixels('EPSG:3857', 0, 1)).toBeLessThan(0.125);
    expect(worstErrorPixels('EPSG:3395', 8, 1)).toBeLessThan(0.125);
  });
});
