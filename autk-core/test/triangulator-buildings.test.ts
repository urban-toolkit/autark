import type { FeatureCollection, Geometry, Polygon } from 'geojson';
import { describe, expect, it, vi } from 'vitest';
import { TriangulatorBuildings } from '../src/triangulator-buildings';

const square = (x: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[x, 0], [x + 2, 0], [x + 2, 2], [x, 2], [x, 0]]],
});

function buildings(geometries: Geometry[], properties: Record<string, unknown> = {}): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', id: 'building-a', geometry: { type: 'GeometryCollection', geometries }, properties }],
  };
}

describe('building parts share one feature identity', () => {
  it.each([1, 2, 5])('triangulates %i original parts with inherited attributes', (count) => {
    const input = buildings(Array.from({ length: count }, (_, i) => square(i * 3)), { height: 12 });
    const before = structuredClone(input);
    const [meshes, components] = TriangulatorBuildings.buildMesh(input, [0, 0]);
    expect(meshes.length).toBeGreaterThanOrEqual(count);
    expect(new Set(meshes.map(m => m.featureIndex))).toEqual(new Set([0]));
    expect(components).toHaveLength(1);
    expect(components[0].featureId).toBe('building-a');
    expect(components[0].nPoints).toBe(meshes.reduce((n, m) => n + m.position.length / 3, 0));
    expect(components[0].nTriangles).toBe(meshes.reduce((n, m) => n + m.indices.length / 3, 0));
    expect(input).toEqual(before);
  });

  it('uses geometryIndex rather than the order of part metadata', () => {
    const [meshes] = TriangulatorBuildings.buildMesh(buildings([square(0), square(3)], {
      height: 50,
      parts: [{ geometryIndex: 1, height: 25, min_height: 5 }, { geometryIndex: 0, height: 12 }],
    }), [0, 0]);
    const heights = [[], []] as number[][];
    for (const mesh of meshes) {
      for (let i = 0; i < mesh.position.length; i += 3) {
        heights[mesh.position[i] < 3 ? 0 : 1].push(mesh.position[i + 2]);
      }
    }
    expect(Math.max(...heights[0])).toBe(12);
    expect(Math.min(...heights[0])).toBe(0);
    expect(Math.max(...heights[1])).toBe(25);
    expect(Math.min(...heights[1])).toBe(5);
  });

  it('retains positional metadata compatibility', () => {
    const [meshes] = TriangulatorBuildings.buildMesh(buildings([square(0)], { parts: [{ height: 10 }] }), [0, 0]);
    expect(meshes.length).toBeGreaterThan(0);
  });

  it('allows part levels to override a building height, without treating zero as missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const [meshes] = TriangulatorBuildings.buildMesh(buildings([square(0), square(3)], {
        height: 50,
        parts: [{ geometryIndex: 0, 'building:levels': 2 }, { geometryIndex: 1, height: 0 }],
      }), [0, 0]);
      expect(meshes.length).toBeGreaterThan(0);
      expect(Math.max(...meshes.flatMap(m => Array.from(m.position).filter((_, i) => i % 3 === 2)))).toBeCloseTo(6.8);
      expect(meshes.every(m => Array.from(m.position).filter((_, i) => i % 3 === 0).every(x => x < 3))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('uses fallback only for missing height, never an explicit zero', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const [missing] = TriangulatorBuildings.buildMesh(buildings([square(0)]), [0, 0], true);
      expect(missing.length).toBeGreaterThan(0);
      expect(random).toHaveBeenCalledOnce();
      random.mockClear();
      const [zero] = TriangulatorBuildings.buildMesh(buildings([square(0)], { height: 0 }), [0, 0], true);
      expect(zero).toEqual([]);
      expect(random).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      random.mockRestore();
    }
  });

  it.each([
    [{ geometryIndex: 2, height: 10 }],
    [{ geometryIndex: -1, height: 10 }],
    [{ geometryIndex: 0.5, height: 10 }],
    [{ geometryIndex: 0, height: 10 }, { geometryIndex: 0, height: 20 }],
    [{ geometryIndex: 0, height: 10 }, { height: 20 }],
  ].map(parts => ({ parts })))('rejects ambiguous or invalid part indices: %j', ({ parts }) => {
    expect(() => TriangulatorBuildings.buildMesh(buildings([square(0), square(3)], { parts }), [0, 0])).toThrow(/geometryIndex/);
  });

  it('rejects nested building collections instead of silently skipping them', () => {
    expect(() => TriangulatorBuildings.buildMesh(buildings([{ type: 'GeometryCollection', geometries: [square(0)] }], {
      height: 10,
    }), [0, 0])).toThrow(/nested/i);
  });

  it('keeps polygon holes out of the roof mesh', () => {
    const polygon: Polygon = {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]],
      ],
    };
    const [meshes] = TriangulatorBuildings.buildMesh(buildings([polygon], { height: 10 }), [0, 0]);
    let roofArea = 0;
    for (const mesh of meshes) {
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const [a, b, c] = Array.from(mesh.indices.slice(i, i + 3)).map(index => Array.from(mesh.position.slice(index * 3, index * 3 + 3)));
        if (![a, b, c].every(p => p[2] === 10)) continue;
        roofArea += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      }
    }
    expect(roofArea).toBeCloseTo(84);
  });
});
