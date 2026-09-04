import type { Feature, FeatureCollection } from 'geojson';
import { describe, expect, it } from 'vitest';

import { TriangulatorPolygons } from '../src/triangulator-polygons';

function collection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function triangleArea(position: Float32Array, first: number, second: number, third: number): number {
  const ax = position[first * 2];
  const ay = position[first * 2 + 1];
  const bx = position[second * 2];
  const by = position[second * 2 + 1];
  const cx = position[third * 2];
  const cy = position[third * 2 + 1];
  return Math.abs((ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2);
}

function meshArea(position: Float32Array, indices: Uint32Array): number {
  let area = 0;
  for (let index = 0; index < indices.length; index += 3) {
    area += triangleArea(position, indices[index], indices[index + 1], indices[index + 2]);
  }
  return area;
}

function segmentKeys(position: Float32Array, indices: Uint32Array): string[] {
  return Array.from({ length: indices.length / 2 }, (_, index) => {
    const first = indices[index * 2] * 2;
    const second = indices[index * 2 + 1] * 2;
    const points = [`${position[first]},${position[first + 1]}`, `${position[second]},${position[second + 1]}`];
    return points.sort().join('|');
  }).sort();
}

describe('TriangulatorPolygons', () => {
  it('triangulates polygons in local coordinates', () => {
    const data = collection([
      {
        type: 'Feature',
        id: 'block',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[[10, 20], [14, 20], [14, 23], [10, 23], [10, 20]]],
        },
      },
    ]);

    const [meshes, components] = TriangulatorPolygons.buildMesh(data, [10, 20]);
    const mesh = meshes[0];
    const xCoordinates = Array.from(mesh.position).filter((_, index) => index % 2 === 0);
    const yCoordinates = Array.from(mesh.position).filter((_, index) => index % 2 === 1);

    expect([Math.min(...xCoordinates), Math.max(...xCoordinates)]).toEqual([0, 4]);
    expect([Math.min(...yCoordinates), Math.max(...yCoordinates)]).toEqual([0, 3]);
    expect(meshArea(mesh.position, mesh.indices!)).toBe(12);
    expect(mesh.featureIndex).toBe(0);
    expect(components).toEqual([
      {
        nPoints: mesh.position.length / 2,
        nTriangles: mesh.indices!.length / 3,
        featureIndex: 0,
        featureId: 'block',
      },
    ]);
  });

  it('excludes holes from the triangulated area', () => {
    const data = collection([
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
            [[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]],
          ],
        },
      },
    ]);

    const [meshes] = TriangulatorPolygons.buildMesh(data, [0, 0]);

    expect(meshArea(meshes[0].position, meshes[0].indices!)).toBe(84);
  });

  it('builds closed border indices for polygon rings', () => {
    const data = collection([
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[[10, 20], [14, 20], [14, 23], [10, 23], [10, 20]]],
        },
      },
    ]);

    const [borders, components] = TriangulatorPolygons.buildBorder(data, [10, 20]);
    const border = borders[0];

    expect(segmentKeys(border.position, border.indices)).toEqual([
      '0,0|0,3',
      '0,0|4,0',
      '0,3|4,3',
      '4,0|4,3',
    ]);
    expect(components).toEqual([{
      nPoints: border.position.length / 2,
      nLines: border.indices.length / 2,
    }]);
  });

  it('emits one mesh for each multipolygon member', () => {
    const data = collection([
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
            [[[3, 0], [5, 0], [5, 2], [3, 2], [3, 0]]],
          ],
        },
      },
    ]);

    const [meshes, components] = TriangulatorPolygons.buildMesh(data, [0, 0]);
    const nPoints = meshes.reduce((total, mesh) => total + mesh.position.length / 2, 0);
    const nTriangles = meshes.reduce((total, mesh) => total + mesh.indices!.length / 3, 0);

    expect(meshes).toHaveLength(2);
    expect(meshes.map((mesh) => mesh.featureIndex)).toEqual([0, 0]);
    expect(components).toEqual([{ nPoints, nTriangles, featureIndex: 0 }]);
  });
});
