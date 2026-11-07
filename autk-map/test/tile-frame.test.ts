import { describe, expect, it } from 'vitest';
import { buildTileFrame } from '../src/tile-frame';
import { buildTileGrid } from '../src/tile-geometry';
import { lonLatToCrs } from '../src/tile-projection';

const ORIGIN = lonLatToCrs('EPSG:3395', 10, 45);

describe('buildTileFrame', () => {
  it('is empty for no tiles', () => {
    const f = buildTileFrame([], 'EPSG:3395', ORIGIN);
    expect(f.draws).toEqual([]);
    expect(f.positions).toHaveLength(0);
    expect(f.indices).toHaveLength(0);
  });

  it('packs tiles one after another with a draw record each', () => {
    const a = { z: 8, x: 135, y: 90 };
    const b = { z: 8, x: 136, y: 90 };
    const f = buildTileFrame([{ tile: a, ref: 'A' }, { tile: b, ref: 'B' }], 'EPSG:3395', ORIGIN);
    // One row from zoom 5 up: four vertices and six indices per tile.
    expect(f.draws).toEqual([
      { ref: 'A', firstIndex: 0, baseVertex: 0, indexCount: 6 },
      { ref: 'B', firstIndex: 6, baseVertex: 4, indexCount: 6 },
    ]);
    const ga = buildTileGrid(a, 'EPSG:3395', ORIGIN);
    const gb = buildTileGrid(b, 'EPSG:3395', ORIGIN);
    expect([...f.positions.subarray(0, 8)]).toEqual([...ga.positions]);
    expect([...f.positions.subarray(8, 16)]).toEqual([...gb.positions]);
    expect([...f.indices.subarray(0, 6)]).toEqual([...ga.indices]);
    expect([...f.indices.subarray(6, 12)]).toEqual([...gb.indices]);
  });

  it('keeps neighbouring tiles joined at the shared edge', () => {
    const f = buildTileFrame(
      [{ tile: { z: 8, x: 135, y: 90 }, ref: 0 }, { tile: { z: 8, x: 136, y: 90 }, ref: 1 }],
      'EPSG:3395',
      ORIGIN,
    );
    // East edge of the first tile (vertices 1 and 3) is the west edge of the second (0 and 2).
    expect([f.positions[2], f.positions[3]]).toEqual([f.positions[8], f.positions[9]]);
    expect([f.positions[6], f.positions[7]]).toEqual([f.positions[12], f.positions[13]]);
  });

  it('counts the extra rows of a low zoom tile', () => {
    const f = buildTileFrame([{ tile: { z: 0, x: 0, y: 0 }, ref: 'w' }], 'EPSG:3395', ORIGIN);
    // Four rows: ten vertices, twenty-four indices.
    expect(f.positions.length / 2).toBe(10);
    expect(f.draws[0]!.indexCount).toBe(24);
  });

  it('draws a tile with the matching part of an ancestor image', () => {
    // The tile is the south-east child of its parent: u and v both in [0.5, 1].
    const parent = { z: 7, x: 67, y: 45 };
    const child = { z: 8, x: 135, y: 91 };
    const f = buildTileFrame([{ tile: child, ref: 'p', levels: 1 }], 'EPSG:3395', ORIGIN);
    expect([...f.texCoords]).toEqual([0.5, 0.5, 1, 0.5, 0.5, 1, 1, 1]);
    // Position still belongs to the child, not to the ancestor.
    expect([...f.positions]).toEqual([...buildTileGrid(child, 'EPSG:3395', ORIGIN).positions]);
    expect(parent.x * 2 + 1).toBe(child.x);
  });

  it('maps a two-level ancestor to a quarter-size rectangle', () => {
    const child = { z: 9, x: 271, y: 183 };
    const f = buildTileFrame([{ tile: child, ref: 'g', levels: 2 }], 'EPSG:3395', ORIGIN);
    // x = 271 = 4*67 + 3, y = 183 = 4*45 + 3: the last quarter on both axes.
    expect([...f.texCoords]).toEqual([0.75, 0.75, 1, 0.75, 0.75, 1, 1, 1]);
  });

  it('keeps unrelated own-image tiles at full texture coordinates', () => {
    const f = buildTileFrame([{ tile: { z: 8, x: 1, y: 1 }, ref: 'own', levels: 0 }], 'EPSG:3857', [0, 0]);
    expect([...f.texCoords]).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
  });
});
