import { afterEach, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
    init: vi.fn(), loadOsm: vi.fn(), loadGeoTiff: vi.fn(), loadCsv: vi.fn(),
    spatialQuery: vi.fn(), rawQuery: vi.fn(), removeLayer: vi.fn(),
    getLayer: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
}));
vi.mock('@urban-toolkit/autk-db', () => ({ AutkDb: class {
    init = calls.init;
    loadOsm = calls.loadOsm;
    loadGeoTiff = calls.loadGeoTiff;
    loadCsv = calls.loadCsv;
    spatialQuery = calls.spatialQuery;
    rawQuery = calls.rawQuery;
    removeLayer = calls.removeLayer;
    getLayer = calls.getLayer;
} }));
import { NiteroiData } from '../src/niteroi/data';
import { ShadowsData } from '../src/shadows/data';

afterEach(() => vi.clearAllMocks());

it('loads the local Niterói PBF before the unchanged raster/24-band join', async () => {
    await new NiteroiData().load(vi.fn());
    expect(calls.loadOsm).toHaveBeenCalledWith({
        pbfFileUrl: expect.stringMatching(/data\/niteroi\.osm\.pbf$/),
        queryArea: { geocodeArea: 'Rio de Janeiro', areas: ['Niterói'] },
        outputTableName: 'table_osm', autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads'] },
    });
    expect(calls.loadOsm.mock.invocationCallOrder[0]).toBeLessThan(calls.loadGeoTiff.mock.invocationCallOrder[0]);
    expect(calls.spatialQuery.mock.calls[0][0].near.distance).toBe(1000);
    expect(calls.spatialQuery.mock.calls[0][0].groupBy).toHaveLength(24);
});

it('loads the local Chicago PBF before measurements and road segmentation', async () => {
    await new ShadowsData().load(vi.fn());
    expect(calls.loadOsm).toHaveBeenCalledWith({
        pbfFileUrl: expect.stringMatching(/data\/shadows-chicago\.osm\.pbf$/),
        queryArea: { geocodeArea: 'Chicago', areas: ['Loop', 'Near South Side'] },
        outputTableName: 'table_osm', autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
    });
    expect(calls.loadOsm.mock.invocationCallOrder[0]).toBeLessThan(calls.loadCsv.mock.invocationCallOrder[0]);
    expect(calls.rawQuery.mock.calls[0][0].output.tableName).toBe('table_roads_20m');
    expect(calls.spatialQuery.mock.calls.map(([params]) => [params.near.distance, params.groupBy[0].column]))
        .toEqual([[200, 'jun'], [200, 'sep'], [200, 'dez']]);
    expect(calls.removeLayer).toHaveBeenCalledExactlyOnceWith('shadows');
    expect(calls.spatialQuery.mock.invocationCallOrder.at(-1)).toBeLessThan(calls.removeLayer.mock.invocationCallOrder[0]);
    expect(calls.removeLayer.mock.invocationCallOrder[0]).toBeLessThan(calls.getLayer.mock.invocationCallOrder[0]);
});

it('does not remove shadow measurements when a monthly join fails', async () => {
    calls.spatialQuery.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Join failed'));
    await expect(new ShadowsData().load(vi.fn())).rejects.toThrow('Join failed');
    expect(calls.spatialQuery).toHaveBeenCalledTimes(2);
    expect(calls.removeLayer).not.toHaveBeenCalled();
    expect(calls.getLayer).not.toHaveBeenCalled();
});

it.each([NiteroiData, ShadowsData])('does not fall back to Overpass when a local PBF load fails', async Data => {
    calls.loadOsm.mockRejectedValueOnce(new Error('Local PBF unavailable'));
    await expect(new Data().load(vi.fn())).rejects.toThrow('Local PBF unavailable');
    expect(calls.loadOsm).toHaveBeenCalledTimes(1);
    expect(calls.loadCsv).not.toHaveBeenCalled();
    expect(calls.loadGeoTiff).not.toHaveBeenCalled();
});
