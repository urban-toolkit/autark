import { describe, expect, it } from 'vitest';
import type { FeatureCollection, Geometry } from 'geojson';
import { DEFAULT_WORKSPACE_COORDINATE_FORMAT, registerCrs, reprojectFeatureCollection, reprojectPosition, isSupportedCrs, lonLatToCrs, crsToLonLat } from '../src/index';

const collection: FeatureCollection<Geometry | null> = {
    type: 'FeatureCollection', bbox: [-74, 40.7, 15, -73.9, 40.8, 15],
    features: [{ type: 'Feature', id: 'area', properties: { name: 'Test', height: 12 },
        bbox: [-74, 40.7, -73.9, 40.8],
        geometry: { type: 'GeometryCollection', bbox: [-74, 40.7, -73.9, 40.8], geometries: [
            { type: 'Point', coordinates: [-74, 40.7, 15] },
            { type: 'MultiPoint', coordinates: [[-74, 40.7], [-73.9, 40.8]] },
            { type: 'LineString', coordinates: [[-74, 40.7], [-73.9, 40.8]] },
            { type: 'MultiLineString', coordinates: [[[-74, 40.7], [-73.9, 40.8]]] },
            { type: 'Polygon', coordinates: [
                [[-74, 40.7], [-73.9, 40.7], [-73.9, 40.8], [-74, 40.7]],
                [[-73.98, 40.72], [-73.96, 40.72], [-73.96, 40.74], [-73.98, 40.72]],
            ] },
            { type: 'MultiPolygon', coordinates: [[[[-74, 40.7], [-73.9, 40.7], [-73.9, 40.8], [-74, 40.7]]]] },
            { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [-73.9, 40.8] }] },
        ] },
    }, { type: 'Feature', properties: { name: 'Missing geometry' }, geometry: null }],
};

describe('shared CRS transformations', () => {
    it.each(['EPSG:3395', 'EPSG:3857'] as const)('matches PROJ for longitude/latitude to %s', crs => {
        const [x, y, z] = reprojectPosition([-74, 40.7, 15], 'EPSG:4326', crs);
        expect(x).toBeCloseTo(-8237642.31870224, 3);
        expect(y).toBeCloseTo(crs === 'EPSG:3395' ? 4940322.38075688 : 4968191.93018821, 3);
        expect(z).toBe(15);
        const roundTrip = reprojectPosition([x, y, z], crs, 'EPSG:4326');
        expect(roundTrip[0]).toBeCloseTo(-74, 9);
        expect(roundTrip[1]).toBeCloseTo(40.7, 9);
    });

    it('transforms between projected CRSs without changing horizontal alignment', () => {
        const point = reprojectPosition([-8237642.31870224, 4968191.93018821], 'EPSG:3857', 'EPSG:3395');
        expect(point[0]).toBeCloseTo(-8237642.31870224, 3);
        expect(point[1]).toBeCloseTo(4940322.38075688, 3);
    });

    it('transforms every vector geometry, nested collections, holes, and declared bounds without mutation', () => {
        const original = structuredClone(collection);
        const projected = reprojectFeatureCollection(collection, 'EPSG:4326', DEFAULT_WORKSPACE_COORDINATE_FORMAT);
        expect(projected).not.toBe(collection);
        expect(collection).toEqual(original);
        expect(projected.features[0].id).toBe('area');
        expect(projected.features[0].properties).toEqual(collection.features[0].properties);
        expect(projected.features[1].geometry).toBeNull();
        expect(projected.bbox).toEqual([
            ...reprojectPosition([-74, 40.7, 15], 'EPSG:4326', 'EPSG:3395'),
            ...reprojectPosition([-73.9, 40.8, 15], 'EPSG:4326', 'EPSG:3395'),
        ]);
        const roundTrip = reprojectFeatureCollection(projected, 'EPSG:3395', 'EPSG:4326');
        // All geometries, holes, bounds, and Z values survive the round trip.
        const rounded = JSON.parse(JSON.stringify(roundTrip), (_key, value) => typeof value === 'number' ? Number(value.toFixed(7)) : value);
        expect(rounded).toEqual(original);
    });

    it('does not copy or transform data that already uses the target CRS', () => {
        expect(reprojectFeatureCollection(collection, 'EPSG:3395', 'EPSG:3395')).toBe(collection);
    });

    it('handles an empty collection and removes stale legacy CRS metadata on conversion', () => {
        const input = { type: 'FeatureCollection' as const, features: [], crs: { type: 'name', properties: { name: 'EPSG:4326' } } };
        const projected = reprojectFeatureCollection(input, 'EPSG:4326', 'EPSG:3857');
        expect(projected.features).toEqual([]);
        expect(projected).not.toHaveProperty('crs');
        expect(input).toHaveProperty('crs');
    });

    it('accepts registered input CRSs and inline PROJ definitions', () => {
        const definition = '+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs';
        registerCrs('AUTK:UTM23S', definition);
        const geographic = [-43.2075, -22.96, 42];
        const projected = reprojectPosition(geographic, 'EPSG:4326', 'AUTK:UTM23S');
        const expected = reprojectPosition(geographic, 'EPSG:4326', 'EPSG:3395');
        for (const source of ['AUTK:UTM23S', definition]) {
            const result = reprojectPosition(projected, source, 'EPSG:3395');
            expect(result[0]).toBeCloseTo(expected[0], 3);
            expect(result[1]).toBeCloseTo(expected[1], 3);
            expect(result[2]).toBe(42);
        }
    });

    it('accepts any registered projection for geographic conversion in both directions', () => {
        const definition = '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs';
        registerCrs('AUTK:WORKSPACE_UTM', definition);
        expect(isSupportedCrs('AUTK:WORKSPACE_UTM')).toBe(true);
        expect(isSupportedCrs(definition)).toBe(true);
        expect(isSupportedCrs('EPSG:32618')).toBe(true);
        const projected = lonLatToCrs('AUTK:WORKSPACE_UTM', -75, 40);
        expect(projected[0]).toBeCloseTo(500000, 3);
        expect(projected[1]).toBeCloseTo(4427757.218738, 3);
        const geographic = crsToLonLat('AUTK:WORKSPACE_UTM', ...projected);
        expect(geographic[0]).toBeCloseTo(-75, 8);
        expect(geographic[1]).toBeCloseTo(40, 8);
    });

    it('converts between two registered projected CRSs, not only to or from geographic coordinates', () => {
        registerCrs('AUTK:UTM22S', '+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs');
        registerCrs('AUTK:UTM23S', '+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs');
        const source = [683000, 7460000, 27];
        const target = reprojectPosition(source, 'AUTK:UTM23S', 'AUTK:UTM22S');
        expect(Math.abs(target[0] - source[0])).toBeGreaterThan(100000);
        const restored = reprojectPosition(target, 'AUTK:UTM22S', 'AUTK:UTM23S');
        expect(restored[0]).toBeCloseTo(source[0], 3);
        expect(restored[1]).toBeCloseTo(source[1], 3);
        expect(restored[2]).toBe(27);
    });

    it('recomputes nonlinear projected bounds from all vertices, not just original bbox corners', () => {
        registerCrs('AUTK:POLAR', '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=0 +datum=WGS84 +units=m +no_defs');
        const input: FeatureCollection = { type: 'FeatureCollection', bbox: [-90, 70, 90, 80], features: [{
            type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-90, 80], [0, 70], [90, 80]] },
        }] };
        const output = reprojectFeatureCollection(input, 'EPSG:4326', 'AUTK:POLAR');
        const middle = reprojectPosition([0, 70], 'EPSG:4326', 'AUTK:POLAR');
        expect(output.bbox![1]).toBeCloseTo(middle[1], 3);
        expect(output.bbox![1]).toBeLessThan(-2000000);
    });

    it('validates registration and protects built-in workspace definitions', () => {
        expect(() => registerCrs('', '+proj=longlat')).toThrow(/nonempty/);
        expect(() => registerCrs('BAD', '+proj=not_a_projection')).toThrow(/Invalid CRS/);
        expect(() => registerCrs('EPSG:3395', '+proj=longlat')).toThrow(/Cannot redefine/);
    });

    it('rejects unsupported CRSs and non-finite coordinates', () => {
        expect(() => reprojectPosition([-74, 40], 'EPSG:NOT_REGISTERED', 'EPSG:3395')).toThrow(/Unsupported CRS/);
        expect(() => reprojectFeatureCollection(collection, 'EPSG:4326', 'EPSG:NOT_REGISTERED')).toThrow(/Unsupported CRS/);
        expect(() => reprojectPosition([NaN, 40], 'EPSG:4326', 'EPSG:3395')).toThrow(/finite/);
        expect(() => reprojectPosition([-74, Infinity], 'EPSG:4326', 'EPSG:3395')).toThrow(/finite/);
    });
});
