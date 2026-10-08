import type { FeatureCollection, Geometry } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PolylineBuilder } from '../src/polyline-builder';
import { TriangulatorPolylines } from '../src/triangulator-polylines';

const collection = (...geometries: Array<Geometry | null>): FeatureCollection => ({
    type: 'FeatureCollection',
    features: geometries.map((geometry, i) => ({ type: 'Feature', id: `feature-${i}`, geometry, properties: {} })),
});

afterEach(() => vi.restoreAllMocks());

describe('width-independent polyline topology', () => {
    it('builds local centers and adjacency without buffering or triangulating polygons', () => {
        const legacy = vi.spyOn(TriangulatorPolylines, 'buildMesh');
        const source = collection({ type: 'LineString', coordinates: [[100, 200], [110, 200], [110, 210]] });
        const data = PolylineBuilder.build(source, [100, 200]);
        expect(legacy).not.toHaveBeenCalled();
        expect(data.components).toEqual([{ nPoints: 15, nTriangles: 6, featureIndex: 0, featureId: 'feature-0' }]);
        expect(Array.from(data.geometry[0].position).slice(0, 10)).toEqual(Array(10).fill(0));
        expect(Array.from(data.attributes).slice(4, 8)).toEqual([0, 0, 10, 10]);
        expect(data.attributes.length).toBe(data.geometry[0].position.length / 10 * 4);
        expect(source.features[0].geometry).toEqual({ type: 'LineString', coordinates: [[100, 200], [110, 200], [110, 210]] });
    });

    it('keeps disconnected paths separate and aggregates them by source feature', () => {
        const data = PolylineBuilder.build(collection(null, { type: 'GeometryCollection', geometries: [
            { type: 'MultiLineString', coordinates: [[[0, 0], [1, 0]], [[10, 0], [11, 0]]] },
            { type: 'GeometryCollection', geometries: [{ type: 'LineString', coordinates: [[20, 0], [21, 0]] }] },
        ] }), [0, 0]);
        expect(data.geometry).toHaveLength(3);
        expect(data.components).toEqual([{ nPoints: 30, nTriangles: 6, featureIndex: 1, featureId: 'feature-1' }]);
        for (const geometry of data.geometry) {
            expect(geometry.featureIndex).toBe(1);
            expect(Math.max(...geometry.indices!)).toBeLessThan(geometry.position.length / 2);
        }
    });

    it('closes rings using wraparound neighbors and a final segment, without duplicate endpoints', () => {
        const data = PolylineBuilder.build(collection({ type: 'LineString', coordinates: [[0, 0], [10, 0], [10, 10], [0, 0]] }), [0, 0]);
        expect(data.components[0]).toMatchObject({ nPoints: 15, nTriangles: 12 });
        expect(Array.from(data.attributes).slice(0, 4)).toEqual([10, 10, 10, 0]);
        expect(Array.from(data.geometry[0].indices!).slice(-6)).toEqual([12, 13, 0, 13, 1, 0]);
    });

    it('removes consecutive duplicates including ones collapsed by float32 conversion', () => {
        const data = PolylineBuilder.build(collection({ type: 'LineString', coordinates: [[0, 0], [0, 0], [1, 0], [1 + 1e-10, 0], [2, 0]] }), [0, 0]);
        expect(data.components[0]).toMatchObject({ nPoints: 15, nTriangles: 6 });
        expect(Array.from(data.attributes).every(Number.isFinite)).toBe(true);
    });

    it('skips invalid and zero-length paths while retaining feature indices', () => {
        const data = PolylineBuilder.build(collection(
            { type: 'LineString', coordinates: [[0, 0], [0, 0]] },
            { type: 'LineString', coordinates: [[0, 0], [Number.NaN, 1], [2, 2]] },
            { type: 'LineString', coordinates: [[0, 0], [Infinity, 1]] },
            { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
        ), [0, 0]);
        expect(data.geometry).toHaveLength(1);
        expect(data.components[0]).toMatchObject({ featureIndex: 3, featureId: 'feature-3', nTriangles: 2 });
    });

    it('keeps reversals and acute turns for bounded shader joins', () => {
        const data = PolylineBuilder.build(collection({ type: 'LineString', coordinates: [[0, 0], [10, 0], [0, 0], [10, 0.01]] }), [0, 0]);
        expect(data.components[0]).toMatchObject({ nPoints: 20, nTriangles: 10 });
        expect(Array.from(data.attributes).every(Number.isFinite)).toBe(true);
        expect(Math.max(...data.geometry[0].indices!)).toBeLessThan(20);
    });
});
