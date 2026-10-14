import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';

const mocks = vi.hoisted(() => ({
    shadowLoad: vi.fn(), shadowCompute: vi.fn(),
    shadowMap: { init: vi.fn(), onBuildingSelection: vi.fn(), highlightBuilding: vi.fn(), highlightRoads: vi.fn(), updateThematic: vi.fn() },
    niteroiMap: { init: vi.fn(), onSelection: vi.fn(), highlight: vi.fn(), updateThematic: vi.fn() },
    niteroiPlot: { onSelection: vi.fn(), setSelection: vi.fn(), updateTimeseries: vi.fn() },
    urbaneData: { init: vi.fn(), loadBaseData: vi.fn(), getLayer: vi.fn(), updateLayer: vi.fn(),
        joinNeighborhoodSkyExposure: vi.fn(), getLayersMetadata: vi.fn(() => []), loadActiveBuildings: vi.fn(), removeLayer: vi.fn() },
    score: vi.fn(),
    urbaneMap: { init: vi.fn(), onSelection: vi.fn(), highlight: vi.fn(), updateThematic: vi.fn(), showBuildings: vi.fn(), showNeighborhoods: vi.fn() },
    urbanePlots: { show: vi.fn(), updateCollection: vi.fn(), setSelection: vi.fn() },
}));

vi.mock('../src/shadows/data', () => ({ ShadowsData: class {
    db = { getLayersMetadata: () => [], getLayer: vi.fn() };
    load = mocks.shadowLoad;
} }));
vi.mock('../src/shadows/compute', () => ({ computeShadows: mocks.shadowCompute }));
vi.mock('../src/shadows/map', () => ({ ShadowsMap: class { constructor() { return mocks.shadowMap; } } }));
vi.mock('../src/shadows/plot', () => ({ ShadowsPlot: class { show = vi.fn(); } }));
vi.mock('../src/niteroi/data', () => ({ NiteroiData: class {
    load = vi.fn();
    db = { getLayer: async () => ({ type: 'FeatureCollection', features: [] }),
        getRaster: async () => ({ type: 'FeatureCollection', features: [] }), getLayersMetadata: () => [] };
} }));
vi.mock('../src/niteroi/compute', () => ({ computeLstRegression: async (data: FeatureCollection) => data }));
vi.mock('../src/niteroi/map', () => ({ NiteroiMap: class { constructor() { return mocks.niteroiMap; } } }));
vi.mock('../src/niteroi/plot', () => ({ NiteroiPlots: class { constructor() { return mocks.niteroiPlot; } } }));
vi.mock('../src/urbane/data', () => ({ UrbaneData: class { constructor() { return mocks.urbaneData; } } }));
vi.mock('../src/urbane/compute', () => ({ computeRoadSkyView: async (_buildings: FeatureCollection, roads: FeatureCollection) => roads, computeScore: mocks.score }));
vi.mock('../src/urbane/map', () => ({ UrbaneMap: class { constructor() { return mocks.urbaneMap; } } }));
vi.mock('../src/urbane/plot', () => ({ UrbanePlots: class { constructor() { return mocks.urbanePlots; } } }));

import { ShadowsApp } from '../src/shadows/app';
import { NiteroiApp } from '../src/niteroi/app';
import { UrbaneApp } from '../src/urbane/app';

const canvas = {} as HTMLCanvasElement;
const host = {} as HTMLElement;
const onProgress = vi.fn();
const roads = (): FeatureCollection => ({ type: 'FeatureCollection', features: [{
    type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [20, 0]] }, properties: { name: 'road' },
}] });
const buildings = (): FeatureCollection => ({ type: 'FeatureCollection', features: [10, 20].map((height) => ({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] }, properties: { height },
})) });
const result = (shadow: number): FeatureCollection => {
    const data = roads();
    data.features[0].properties = { compute: { shadow, contribution: 10 } };
    return data;
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('Shadows asynchronous selection', () => {
    async function init() {
        const source = roads();
        const buildingData = buildings();
        mocks.shadowLoad.mockResolvedValue({ roads: source, buildings: buildingData });
        const app = new ShadowsApp();
        await app.init({ canvas, histogramHost: host, onProgress, onError: vi.fn() });
        return { app, source, buildingData };
    }

    it('does not apply a calculation from an older building selection', async () => {
        const { app, source } = await init();
        let resolveFirst!: (data: FeatureCollection) => void;
        mocks.shadowCompute.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
        mocks.shadowCompute.mockResolvedValueOnce(result(120));
        const first = app.selectBuilding(0);
        await app.selectBuilding(1);
        resolveFirst(result(60));
        await first;
        expect(source.features[0].properties?.compute.shadow).toBe(120);
    });

    it('deselection invalidates pending compute results', async () => {
        const { app, source } = await init();
        let resolve!: (data: FeatureCollection) => void;
        mocks.shadowCompute.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
        const pending = app.selectBuilding(0);
        await app.selectBuilding(null);
        resolve(result(60));
        await pending;
        expect(source.features[0].properties?.compute.shadow).toBe(0);
    });

    it('invalid geometry clears previous selection and compute state', async () => {
        const { app, source, buildingData } = await init();
        mocks.shadowCompute.mockResolvedValueOnce(result(60));
        await app.selectBuilding(0);
        buildingData.features[1].geometry = { type: 'Point', coordinates: [0, 0] };
        await expect(app.selectBuilding(1)).rejects.toThrow('footprint');
        expect(source.features[0].properties?.compute.shadow).toBe(0);
        const calls = mocks.shadowCompute.mock.calls.length;
        await app.changeMonth('sep');
        expect(mocks.shadowCompute.mock.calls.length).toBe(calls);
    });

    it('month changes discard results for the previous month', async () => {
        const { app, source } = await init();
        let resolve!: (data: FeatureCollection) => void;
        mocks.shadowCompute.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
        const pending = app.selectBuilding(0);
        mocks.shadowCompute.mockResolvedValueOnce(result(180));
        await app.changeMonth('sep');
        resolve(result(60));
        await pending;
        expect(source.features[0].properties?.compute.shadow).toBe(180);
    });
});

describe('Niterói linked selection', () => {
    it('picking cancels an older pending brush update', async () => {
        vi.useFakeTimers();
        const app = new NiteroiApp();
        await app.init({ canvas, scatterHost: host, lineHost: host, onProgress });
        const brush = mocks.niteroiPlot.onSelection.mock.calls[0][0];
        const pick = mocks.niteroiMap.onSelection.mock.calls[0][0];
        brush([1]);
        pick([2]);
        vi.runAllTimers();
        expect(mocks.niteroiPlot.updateTimeseries.mock.calls).toEqual([[[2]]]);
        expect(mocks.niteroiPlot.setSelection).toHaveBeenCalledWith([2]);
    });
});

describe('Urbane operation state', () => {
    async function init() {
        const neighborhoods: FeatureCollection = { type: 'FeatureCollection', features: [{
            type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { ntaname: 'Neighborhood' },
        }] };
        mocks.urbaneData.getLayer.mockResolvedValue(neighborhoods);
        mocks.score.mockImplementation(async (data: FeatureCollection) => data);
        const app = new UrbaneApp();
        await app.init({ canvas, plotDivParallel: host, plotDivTable: host, onProgress });
        app.selectedNeighIds = [0];
        return app;
    }

    it('shows the selected building collection in both the map and linked plots after drill-down', async () => {
        const app = await init();
        const selectedBuildings = buildings();
        mocks.urbaneData.loadActiveBuildings.mockResolvedValueOnce(selectedBuildings);
        await app.drillDown('none');
        expect(mocks.urbaneData.loadActiveBuildings).toHaveBeenCalledWith(app.datasets, ['Neighborhood'], 300);
        expect(mocks.urbaneMap.showBuildings).toHaveBeenCalledWith(selectedBuildings);
        expect(mocks.urbanePlots.show).toHaveBeenLastCalledWith('active_buildings', app.datasets, selectedBuildings, expect.any(Function));
        expect(mocks.urbaneMap.updateThematic).toHaveBeenLastCalledWith('active_buildings', selectedBuildings, 'none');
        expect(app.currentLevel).toBe('active_buildings');
    });

    it('failed drill-down preserves the level and permits retry', async () => {
        const app = await init();
        mocks.urbaneData.loadActiveBuildings.mockRejectedValueOnce(new Error('Data failed'));
        await expect(app.drillDown('none')).rejects.toThrow('Data failed');
        expect(app.currentLevel).toBe('neighborhoods');
        expect(mocks.urbaneMap.showBuildings).not.toHaveBeenCalled();
        mocks.urbaneData.loadActiveBuildings.mockResolvedValueOnce(buildings());
        await app.drillDown('none');
        expect(app.currentLevel).toBe('active_buildings');
    });

    it('prevents a score update from racing a level change', async () => {
        const app = await init();
        let resolve!: (data: FeatureCollection) => void;
        mocks.urbaneData.loadActiveBuildings.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
        const pending = app.drillDown('none');
        await expect(app.updateWeights([...app.weights, 0], 'none')).rejects.toThrow('wait');
        resolve(buildings());
        await pending;
        expect(app.currentLevel).toBe('active_buildings');
    });

    it('a rejected score update preserves weights and releases the operation lock', async () => {
        const app = await init();
        const original = [...app.weights];
        mocks.score.mockRejectedValueOnce(new Error('GPU failed'));
        await expect(app.updateWeights([0, 0, 0, 0, 0, 0, 1, 0], 'none')).rejects.toThrow('GPU failed');
        expect(app.weights).toEqual(original);
        await app.updateWeights([...original, 0], 'none');
        expect(mocks.urbanePlots.updateCollection).toHaveBeenCalled();
    });
});
