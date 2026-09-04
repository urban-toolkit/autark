import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TriangulatorBuildings } from '../src/triangulator-buildings';
import type { LayerGeometry } from '../src/types-mesh';

const footprint = [[[10, 20], [14, 20], [14, 23], [10, 23], [10, 20]]];

function collection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function building(properties: Record<string, unknown>, id: string | number = 'building'): Feature {
  return { type: 'Feature', id, properties, geometry: { type: 'Polygon', coordinates: footprint } };
}

function axisValues(meshes: LayerGeometry[], axis: 0 | 1 | 2): number[] {
  return meshes.flatMap((mesh) => Array.from(mesh.position).filter((_, index) => index % 3 === axis));
}

function elevationsAt(meshes: LayerGeometry[], matches: (x: number) => boolean): number[] {
  return meshes.flatMap((mesh) => Array.from({ length: mesh.position.length / 3 }, (_, index) => index)
    .filter((index) => matches(mesh.position[index * 3]))
    .map((index) => mesh.position[index * 3 + 2]));
}

function counts(meshes: LayerGeometry[]): { nPoints: number; nTriangles: number } {
  return meshes.reduce((total, mesh) => ({
    nPoints: total.nPoints + mesh.position.length / 3,
    nTriangles: total.nTriangles + mesh.indices!.length / 3,
  }), { nPoints: 0, nTriangles: 0 });
}

afterEach(() => vi.restoreAllMocks());

describe('TriangulatorBuildings', () => {
  it('extrudes translated footprints between explicit heights', () => {
    const [meshes, components] = TriangulatorBuildings.buildMesh(
      collection([building({ height: 10, min_height: 2 }, 'tower')]),
      [10, 20],
    );
    const xCoordinates = axisValues(meshes, 0);
    const yCoordinates = axisValues(meshes, 1);
    const elevations = axisValues(meshes, 2);

    expect([Math.min(...xCoordinates), Math.max(...xCoordinates)]).toEqual([0, 4]);
    expect([Math.min(...yCoordinates), Math.max(...yCoordinates)]).toEqual([0, 3]);
    expect([Math.min(...elevations), Math.max(...elevations)]).toEqual([2, 10]);
    expect(meshes.every((mesh) => mesh.indices!.every((index) => index < mesh.position.length / 3))).toBe(true);
    expect(components).toEqual([{ ...counts(meshes), featureIndex: 0, featureId: 'tower' }]);
  });

  it('derives elevations from building levels', () => {
    const [meshes] = TriangulatorBuildings.buildMesh(
      collection([building({ levels: 3, min_level: 1 })]),
      [10, 20],
    );
    const elevations = axisValues(meshes, 2);

    expect(Math.min(...elevations)).toBeCloseTo(3.4);
    expect(Math.max(...elevations)).toBeCloseTo(10.2);
  });

  it('uses per-part metadata for geometry collections', () => {
    const data = collection([
      {
        type: 'Feature',
        id: 7,
        properties: { parts: [{ height: 5 }, { height: 8, min_height: 2 }] },
        geometry: {
          type: 'GeometryCollection',
          geometries: [
            { type: 'Polygon', coordinates: footprint },
            {
              type: 'Polygon',
              coordinates: [[[16, 20], [18, 20], [18, 23], [16, 23], [16, 20]]],
            },
          ],
        },
      },
    ]);

    const [meshes, components] = TriangulatorBuildings.buildMesh(data, [10, 20]);
    const firstPartElevations = elevationsAt(meshes, (x) => x <= 4);
    const secondPartElevations = elevationsAt(meshes, (x) => x >= 6);

    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((mesh) => mesh.featureIndex === 0)).toBe(true);
    expect([Math.min(...firstPartElevations), Math.max(...firstPartElevations)]).toEqual([0, 5]);
    expect([Math.min(...secondPartElevations), Math.max(...secondPartElevations)]).toEqual([2, 8]);
    expect(components).toEqual([{ ...counts(meshes), featureIndex: 0, featureId: 7 }]);
  });

  it('reports parts without valid height metadata', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const [meshes, components] = TriangulatorBuildings.buildMesh(
      collection([building({})]),
      [10, 20],
    );

    expect(meshes).toEqual([]);
    expect(components).toEqual([
      { nPoints: 0, nTriangles: 0, featureIndex: 0, featureId: 'building' },
    ]);
    expect(warn).toHaveBeenCalledOnce();
  });
});
