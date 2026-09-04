import type { Feature, FeatureCollection } from 'geojson';
import { describe, expect, it } from 'vitest';

import { TriangulatorPolylines } from '../src/triangulator-polylines';

function collection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function road(highway: unknown): Feature {
  return { type: 'Feature', properties: { highway }, geometry: null };
}

describe('TriangulatorPolylines', () => {
  it('buffers lines in local coordinates with component metadata', () => {
    const data = collection([
      {
        type: 'Feature',
        id: 'road',
        properties: {},
        geometry: { type: 'LineString', coordinates: [[10, 20], [20, 20]] },
      },
    ]);

    const [meshes, components] = TriangulatorPolylines.buildMesh(data, [10, 20], () => 1);
    const mesh = meshes[0];
    const xCoordinates = Array.from(mesh.position).filter((_, index) => index % 2 === 0);
    const yCoordinates = Array.from(mesh.position).filter((_, index) => index % 2 === 1);

    expect(Math.min(...xCoordinates)).toBeLessThanOrEqual(0);
    expect(Math.max(...xCoordinates)).toBeGreaterThanOrEqual(10);
    expect([Math.min(...yCoordinates), Math.max(...yCoordinates)]).toEqual([-1, 1]);
    expect(mesh.indices!.length % 3).toBe(0);
    expect(mesh.indices!.every((index) => index < mesh.position.length / 2)).toBe(true);
    expect(mesh.featureIndex).toBe(0);
    expect(components).toEqual([
      {
        nPoints: mesh.position.length / 2,
        nTriangles: mesh.indices!.length / 3,
        featureIndex: 0,
        featureId: 'road',
      },
    ]);
  });

  it('falls back to the default offset for invalid resolver values', () => {
    const data = collection([
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [[0, 0], [10, 0]] },
      },
    ]);

    const [meshes] = TriangulatorPolylines.buildMesh(data, [0, 0], () => 0);
    const yCoordinates = Array.from(meshes[0].position).filter((_, index) => index % 2 === 1);

    expect(Math.min(...yCoordinates)).toBe(-TriangulatorPolylines.offset);
    expect(Math.max(...yCoordinates)).toBe(TriangulatorPolylines.offset);
  });

  it('resolves normalized road widths', () => {
    expect(TriangulatorPolylines.resolveRoadHalfWidth(road(' MOTORWAY ; primary '))).toBe(10);
    expect(TriangulatorPolylines.resolveRoadHalfWidth(road(['', 'PRIMARY']))).toBe(6);
    expect(TriangulatorPolylines.resolveRoadHalfWidth(road('unknown'))).toBe(3.5);
  });

  it('skips lines without two distinct points', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[1, 1], [1, 1]] },
    };

    expect(TriangulatorPolylines.lineStringToPolyline(feature, [0, 0], 1)).toEqual([]);
  });
});
