import { describe, expect, it } from 'vitest';
import {
  ancestorTile,
  isValidTile,
  lonLatToTileCoord,
  metresPerPixel,
  parentTile,
  tileKey,
  tileLonLatBounds,
  tileMercatorBounds,
  tilesInBounds,
  tileRangeCount,
  tileRangeInBounds,
  tilesInRange,
  tilesPerAxis,
  uvInAncestor,
} from '../src/tile-index';
import { WEB_MERCATOR_EXTENT, WEB_MERCATOR_MAX_LAT } from '../src/tile-projection';

/** A real Esri z17 tile whose corner GDAL reported as lon 2.647705078125, lat 6.465421906280472. */
const LAGOS = { z: 17, x: 66500, y: 63177 };

describe('tile addressing', () => {
  it('counts tiles per axis', () => {
    expect(tilesPerAxis(0)).toBe(1);
    expect(tilesPerAxis(10)).toBe(1024);
  });

  it('validates addresses', () => {
    expect(isValidTile({ z: 0, x: 0, y: 0 })).toBe(true);
    expect(isValidTile({ z: 2, x: 3, y: 3 })).toBe(true);
    expect(isValidTile({ z: 2, x: 4, y: 0 })).toBe(false);
    expect(isValidTile({ z: 2, x: -1, y: 0 })).toBe(false);
    expect(isValidTile({ z: 1.5, x: 0, y: 0 })).toBe(false);
    expect(isValidTile({ z: 31, x: 0, y: 0 })).toBe(false);
  });

  it('builds keys that separate sources and tiles', () => {
    expect(tileKey('osm', { z: 3, x: 1, y: 2 })).toBe('osm/3/1/2');
    expect(tileKey('osm', { z: 3, x: 1, y: 2 })).not.toBe(tileKey('esri', { z: 3, x: 1, y: 2 }));
  });
});

describe('ancestors', () => {
  it('finds the parent', () => {
    expect(parentTile({ z: 3, x: 5, y: 6 })).toEqual({ z: 2, x: 2, y: 3 });
    expect(parentTile({ z: 0, x: 0, y: 0 })).toBeNull();
  });

  it('climbs several levels', () => {
    expect(ancestorTile({ z: 5, x: 21, y: 10 }, 0)).toEqual({ z: 5, x: 21, y: 10 });
    expect(ancestorTile({ z: 5, x: 21, y: 10 }, 2)).toEqual({ z: 3, x: 5, y: 2 });
    expect(ancestorTile({ z: 5, x: 21, y: 10 }, 5)).toEqual({ z: 0, x: 0, y: 0 });
    expect(ancestorTile({ z: 5, x: 21, y: 10 }, 6)).toBeNull();
    expect(ancestorTile({ z: 5, x: 21, y: 10 }, -1)).toBeNull();
  });

  it('locates a tile inside its ancestor as a UV rectangle', () => {
    // The north-west quarter of the world tile.
    expect(uvInAncestor({ z: 1, x: 0, y: 0 }, 1)).toEqual({ u0: 0, v0: 0, u1: 0.5, v1: 0.5 });
    // The south-east quarter.
    expect(uvInAncestor({ z: 1, x: 1, y: 1 }, 1)).toEqual({ u0: 0.5, v0: 0.5, u1: 1, v1: 1 });
    // A tile in the south-west quarter of its grandparent, two levels up.
    expect(uvInAncestor({ z: 2, x: 1, y: 3 }, 2)).toEqual({ u0: 0.25, v0: 0.75, u1: 0.5, v1: 1 });
    expect(uvInAncestor({ z: 2, x: 1, y: 3 }, 0)).toEqual({ u0: 0, v0: 0, u1: 1, v1: 1 });
    expect(uvInAncestor({ z: 1, x: 0, y: 0 }, 2)).toBeNull();
  });
});

describe('tile bounds', () => {
  it('covers the whole Web Mercator square at zoom 0', () => {
    const b = tileLonLatBounds({ z: 0, x: 0, y: 0 });
    expect(b.west).toBe(-180);
    expect(b.east).toBe(180);
    expect(b.north).toBeCloseTo(WEB_MERCATOR_MAX_LAT, 9);
    expect(b.south).toBeCloseTo(-WEB_MERCATOR_MAX_LAT, 9);

    const m = tileMercatorBounds({ z: 0, x: 0, y: 0 });
    expect(m).toEqual({ minX: -WEB_MERCATOR_EXTENT, maxX: WEB_MERCATOR_EXTENT, minY: -WEB_MERCATOR_EXTENT, maxY: WEB_MERCATOR_EXTENT });
  });

  it('splits the equator between the four zoom-1 tiles', () => {
    expect(tileLonLatBounds({ z: 1, x: 0, y: 0 })).toMatchObject({ west: -180, east: 0 });
    expect(tileLonLatBounds({ z: 1, x: 0, y: 0 }).south).toBeCloseTo(0, 9);
    expect(tileLonLatBounds({ z: 1, x: 1, y: 1 }).north).toBeCloseTo(0, 9);
  });

  it('matches the corner GDAL reported for a real tile', () => {
    const b = tileLonLatBounds(LAGOS);
    expect(b.west).toBeCloseTo(2.647705078125, 9);
    expect(b.north).toBeCloseTo(6.465421906280472, 9);
  });

  it('gives Mercator tile sizes of 2·extent / 2^z', () => {
    const m = tileMercatorBounds({ z: 3, x: 2, y: 5 });
    expect(m.maxX - m.minX).toBeCloseTo((2 * WEB_MERCATOR_EXTENT) / 8, 6);
    expect(m.maxY - m.minY).toBeCloseTo((2 * WEB_MERCATOR_EXTENT) / 8, 6);
  });
});

describe('lonLatToTileCoord', () => {
  it('finds the tile that contains a point', () => {
    const c = lonLatToTileCoord(2.6478, 6.4653, 17);
    expect(Math.floor(c.x)).toBe(LAGOS.x);
    expect(Math.floor(c.y)).toBe(LAGOS.y);
  });

  it('puts the origin at the centre of the world tile grid', () => {
    expect(lonLatToTileCoord(0, 0, 2)).toEqual({ x: 2, y: 2 });
    expect(lonLatToTileCoord(-180, WEB_MERCATOR_MAX_LAT, 5).x).toBe(0);
    expect(lonLatToTileCoord(-180, WEB_MERCATOR_MAX_LAT, 5).y).toBeCloseTo(0, 9);
  });
});

describe('tilesInBounds', () => {
  it('returns all four tiles for the world at zoom 1', () => {
    const tiles = tilesInBounds({ west: -180, south: -85, east: 180, north: 85 }, 1);
    expect(tiles).toEqual([
      { z: 1, x: 0, y: 0 }, { z: 1, x: 1, y: 0 },
      { z: 1, x: 0, y: 1 }, { z: 1, x: 1, y: 1 },
    ]);
  });

  it('returns exactly one tile for that tile\'s own bounds', () => {
    expect(tilesInBounds(tileLonLatBounds(LAGOS), 17)).toEqual([LAGOS]);
  });

  it('returns the neighbours when the box straddles an edge', () => {
    const b = tileLonLatBounds(LAGOS);
    const tiles = tilesInBounds({ west: b.west - 1e-4, south: b.south + 1e-4, east: b.west + 1e-4, north: b.north - 1e-4 }, 17);
    expect(tiles.map((t) => t.x)).toEqual([LAGOS.x - 1, LAGOS.x]);
  });

  it('clamps a box that extends past the world', () => {
    const tiles = tilesInBounds({ west: -400, south: -89.9, east: 400, north: 89.9 }, 2);
    expect(tiles).toHaveLength(16);
    expect(tiles.every(isValidTile)).toBe(true);
  });

  it('lists a view over a city at a working zoom without gaps', () => {
    const tiles = tilesInBounds({ west: 2.6, south: 6.4, east: 2.7, north: 6.5 }, 12);
    const xs = new Set(tiles.map((t) => t.x));
    const ys = new Set(tiles.map((t) => t.y));
    expect(tiles).toHaveLength(xs.size * ys.size);
  });
});

describe('metresPerPixel', () => {
  it('is 156543.03 m at zoom 0 on the equator', () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(156543.03392804097, 6);
  });

  it('halves per zoom level and shrinks with latitude', () => {
    expect(metresPerPixel(5, 0) / metresPerPixel(6, 0)).toBeCloseTo(2, 9);
    expect(metresPerPixel(10, 60)).toBeCloseTo(metresPerPixel(10, 0) / 2, 6);
  });

  it('scales with tile size', () => {
    expect(metresPerPixel(3, 0, 512)).toBeCloseTo(metresPerPixel(3, 0, 256) / 2, 9);
  });
});

describe('tile ranges', () => {
  it('counts a range without listing it', () => {
    const range = tileRangeInBounds({ west: -179, south: -80, east: 179, north: 80 }, 19)!;
    expect(tileRangeCount(range)).toBeGreaterThan(1e11);
  });

  it('lists exactly the tiles it counts, in the order tilesInBounds uses', () => {
    const bounds = { west: 2.6, south: 6.4, east: 2.7, north: 6.5 };
    const range = tileRangeInBounds(bounds, 12)!;
    expect(tilesInRange(range)).toHaveLength(tileRangeCount(range));
    expect(tilesInRange(range)).toEqual(tilesInBounds(bounds, 12));
  });

  it('is null for a box that overlaps nothing', () => {
    expect(tileRangeInBounds({ west: 10, south: 0, east: 5, north: 1 }, 8)).toBeNull();
    expect(tilesInBounds({ west: 10, south: 0, east: 5, north: 1 }, 8)).toEqual([]);
  });
});
