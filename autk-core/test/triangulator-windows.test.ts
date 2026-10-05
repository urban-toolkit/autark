import type { FeatureCollection } from 'geojson';
import { describe, expect, it } from 'vitest';
import { TriangulatorBuildingWithWindows } from '../src/triangulator-windows';

const input: FeatureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', id: 'one-building',
    geometry: { type: 'GeometryCollection', geometries: [
      { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]]] },
      { type: 'Polygon', coordinates: [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]] },
    ] },
    properties: { height: 12, parts: [{ geometryIndex: 1, height: 25, min_height: 5 }] },
  }],
};

describe('windows and roofs use original building parts', () => {
  it('places windows on each part with its own height, base and unique IDs', () => {
    const before = structuredClone(input);
    const layout = TriangulatorBuildingWithWindows.buildWindowLayout(input, 2);
    expect(new Set(layout.windows.map(w => w.geometryIndex))).toEqual(new Set([0, 1]));
    expect(new Set(layout.windows.map(w => w.windowId)).size).toBe(layout.windows.length);
    expect(layout.windows.every(w => w.sourceFeatureIndex === 0)).toBe(true);
    expect(layout.windows.filter(w => w.geometryIndex === 0).every(w => w.buildingHeight === 12 && w.center[2] < 12)).toBe(true);
    expect(layout.windows.filter(w => w.geometryIndex === 1).every(w => w.buildingHeight === 25 && w.center[2] > 5 && w.center[2] < 25)).toBe(true);
    expect(layout.windows.every(w => w.center[0] <= 10 || w.center[0] >= 20)).toBe(true);
    expect(input).toEqual(before);
  });

  it('triangulates separate roofs without filling the courtyard or the gap', () => {
    const [meshes] = TriangulatorBuildingWithWindows.buildMesh(input, [0, 0], 2);
    let area = 0;
    for (const mesh of meshes) {
      expect(mesh.featureIndex).toBe(0);
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const [a, b, c] = Array.from(mesh.indices.slice(i, i + 3)).map(index => Array.from(mesh.position.slice(index * 3, index * 3 + 3)));
        if (!(a[2] === b[2] && b[2] === c[2])) continue;
        expect([a, b, c].every(p => p[0] <= 10) || [a, b, c].every(p => p[0] >= 20)).toBe(true);
        area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      }
    }
    expect(area).toBeCloseTo(184);
  });

  it('keeps the missing-height fallback but respects an explicit zero height', () => {
    const zero = structuredClone(input);
    zero.features[0].properties = { height: 0 };
    expect(TriangulatorBuildingWithWindows.buildWindowLayout(zero, 2).windows).toEqual([]);
    zero.features[0].properties = {};
    expect(TriangulatorBuildingWithWindows.resolveHeight(zero.features[0])).toBe(20);
  });
});
