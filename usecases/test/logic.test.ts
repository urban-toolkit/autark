import { describe, expect, it, vi } from 'vitest';
import type { FeatureCollection, Feature } from 'geojson';

vi.mock('@urban-toolkit/autk-compute', () => ({ ComputeGpgpu: class {}, ComputeRender: class {} }));

import { yearBand } from '../src/niteroi/config';
import { prepareLstTimeseries } from '../src/niteroi/compute';
import { decorateSkyExposureFields, computeScore } from '../src/urbane/compute';
import { clearRoadsCompute, mergeComputedRoads, resolveBuildingFootprint, resolveBuildingHeight,
    MONTH_CONFIG, MONTH_DOY, isMonthCode } from '../src/shadows/utils';

const collection = (properties: Feature['properties']): FeatureCollection => ({
    type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties }],
});

describe('Niterói analytical inputs', () => {
    it('maps the supported years to raster bands and rejects invalid years', () => {
        expect(yearBand(2001)).toBe('band_1');
        expect(yearBand(2024)).toBe('band_24');
        for (const year of [2000, 2025, NaN, 2001.5]) expect(() => yearBand(year)).toThrow();
    });
    it('prepares plot timestamps without mutating GPU inputs or losing compute output', () => {
        const source = collection({ lst_timeseries: [25, 26], compute: { angle: 45, intercept: 25 } });
        const output = prepareLstTimeseries(source);
        expect(output.features[0].properties).toEqual({
            lst_timeseries: [{ timestamp: '2001', value: 25 }, { timestamp: '2002', value: 26 }],
            compute: { angle: 45, intercept: 25 },
        });
        expect(source.features[0].properties?.lst_timeseries).toEqual([25, 26]);
    });
});

describe('Shadows geometry and results', () => {
    it('keeps month labels and compute dates in one configuration', () => {
        for (const month of MONTH_CONFIG) {
            expect(isMonthCode(month.code)).toBe(true);
            expect(MONTH_DOY[month.code]).toBe(month.doy);
        }
        expect(isMonthCode('jan')).toBe(false);
    });
    it('chooses the largest outer ring and maximum part height', () => {
        const small = [[0, 0], [1, 0], [1, 1], [0, 0]];
        const large = [[0, 0], [4, 0], [4, 4], [0, 0]];
        const feature: Feature = {
            type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [
                { type: 'Polygon', coordinates: [small] }, { type: 'MultiPolygon', coordinates: [[large]] },
            ] }, properties: { parts: [{ height: '10' }, { 'building:levels': '8' }] },
        };
        expect(resolveBuildingFootprint(feature)).toEqual(large);
        expect(resolveBuildingHeight(feature)).toBe(24);
        expect(resolveBuildingHeight(collection({}).features[0])).toBe(20);
        expect(resolveBuildingFootprint(collection({}).features[0])).toBeNull();
    });
    it('preserves source properties on merge and clears only computed values', () => {
        const roads = collection({ name: 'road', sjoin: { value: 5 } });
        mergeComputedRoads(roads, collection({ compute: { shadow: 60, contribution: 10 } }));
        expect(roads.features[0].properties).toEqual({ name: 'road', sjoin: { value: 5 }, compute: { shadow: 60, contribution: 10 } });
        clearRoadsCompute(roads);
        expect(roads.features[0].properties).toEqual({ name: 'road', sjoin: { value: 5 }, compute: { shadow: 0, contribution: 0 } });
    });
    it('rejects result count mismatches instead of partially updating roads', () => {
        const roads = collection({ name: 'road' });
        expect(() => mergeComputedRoads(roads, { type: 'FeatureCollection', features: [] })).toThrow();
        expect(roads.features[0].properties).toEqual({ name: 'road' });
    });
});

describe('Urbane score preparation', () => {
    it('decorates spatial-join aliases and initializes null properties', () => {
        const data = collection({ sjoin: { avg: {
            'table_osm_roads.compute.skyViewFactor': 0.7,
            'table_osm_roads.compute.skyViewFactor_norm': 0.9,
        } } });
        decorateSkyExposureFields(data);
        expect(data.features[0].properties?.sjoin.avg.skyExposure).toBe(0.7);
        expect(data.features[0].properties?.sjoin.avg.skyExposure_norm).toBe(0.9);
        const empty = collection(null);
        decorateSkyExposureFields(empty);
        expect(empty.features[0].properties?.sjoin.avg.skyExposure).toBe(0);
    });
    it('rejects mismatched or invalid GPU weight arrays', async () => {
        for (const weights of [[], [NaN], [-1]]) {
            await expect(computeScore(collection({}), ['tree'], weights, 0)).rejects.toThrow();
        }
    });
});
