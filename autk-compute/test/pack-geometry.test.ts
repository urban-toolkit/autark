import type { Feature, Geometry, Position } from 'geojson';
import { expect, it } from 'vitest';
import { packGeometry } from '../src/pack-geometry';

const a = [1, 2];
const b = [3, 4, 5];
const exterior = [a, b, [0, 1], a];
const hole = [[1, 1], [2, 2], [3, 3], [1, 1]];
const cases: [string, Geometry | null, number[][], Position[]][] = [
    ['Point', { type: 'Point', coordinates: b }, [[1, 0, 1, 1]], [b]],
    ['MultiPoint', { type: 'MultiPoint', coordinates: [a, b] }, [[2, 0, 2, 1]], [a, b]],
    ['LineString', { type: 'LineString', coordinates: [a, b] }, [[3, 0, 2, 1]], [a, b]],
    ['MultiLineString', { type: 'MultiLineString', coordinates: [[a, b], [b, a]] },
        [[4, 0, 4, 3], [3, 0, 2, 2], [3, 2, 4, 3]], [a, b, b, a]],
    ['Polygon', { type: 'Polygon', coordinates: [exterior, hole] },
        [[5, 0, 8, 3], [8, 0, 4, 2], [8, 4, 8, 3]], [...exterior, ...hole]],
    ['MultiPolygon', { type: 'MultiPolygon', coordinates: [[exterior, hole], [exterior]] },
        [[6, 0, 12, 6], [5, 0, 8, 4], [8, 0, 4, 3], [8, 4, 8, 4], [5, 8, 12, 6], [8, 8, 12, 6]],
        [...exterior, ...hole, ...exterior]],
    ['nested GeometryCollection', { type: 'GeometryCollection', geometries: [
        { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: a }] },
        { type: 'LineString', coordinates: [a, b] },
    ] }, [[7, 0, 3, 4], [7, 0, 1, 3], [1, 0, 1, 3], [3, 1, 3, 4]], [a, a, b]],
    ['empty geometry', { type: 'MultiPolygon', coordinates: [] }, [[6, 0, 0, 1]], []],
    ['null geometry', null, [[0, 0, 0, 1]], []],
];

it.each(cases)('packs %s without losing boundaries', (_name, geometry, nodes, positions) => {
    const features: Feature<Geometry | null>[] = [null, geometry].map(geometry => ({ type: 'Feature', geometry, properties: {} }));
    const { topology, points } = packGeometry(features);
    expect(topology).toEqual(new Uint32Array([2, 0, 1, 0, 0, 0, 1, ...nodes.flatMap(
        ([kind, start, end, next]) => [kind, start, end, next + 1],
    )]));
    expect(points).toEqual(positions.length ? new Float32Array(positions.flatMap(
        ([x, y, z]) => [x, y, z ?? 0, z === undefined ? 2 : 3],
    )) : new Float32Array(4));
});
