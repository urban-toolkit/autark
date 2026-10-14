import type { FeatureCollection } from 'geojson';
import { expect, it, vi } from 'vitest';

const map = vi.hoisted(() => ({ init: vi.fn(), loadCollection: vi.fn(), updateRenderInfo: vi.fn() }));
vi.mock('@urban-toolkit/autk-map', () => ({
    AutkMap: class {
        init = map.init;
        loadCollection = map.loadCollection;
        updateRenderInfo = map.updateRenderInfo;
    },
    MapEvent: { PICKING: 'picking' },
}));
vi.mock('@urban-toolkit/autk-db', () => ({ AutkDb: class {} }));
import { ShadowsMap } from '../src/shadows/map';
import { BUILDINGS_LAYER, ROADS_LAYER } from '../src/shadows/data';

it('enables the existing missing-height flag only for building layers', async () => {
    const buildings: FeatureCollection = { type: 'FeatureCollection', features: [{
        type: 'Feature', id: 7, properties: { building: 'yes' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    }] };
    const roads: FeatureCollection = { type: 'FeatureCollection', features: [] };
    const surface: FeatureCollection = { type: 'FeatureCollection', features: [] };
    const layers: Parameters<ShadowsMap['init']>[0] = [
        { name: BUILDINGS_LAYER, type: 'buildings', source: 'osm', columns: [] },
        { name: ROADS_LAYER, type: 'roads', source: 'user', columns: [] },
        { name: 'table_osm_surface', type: 'surface', source: 'osm', columns: [] },
        { name: 'table_osm_roads', type: 'roads', source: 'osm', columns: [] },
    ];
    const getLayer = vi.fn().mockResolvedValue(surface);
    await new ShadowsMap({} as HTMLCanvasElement).init(layers, getLayer, roads, buildings);
    expect(map.loadCollection).toHaveBeenCalledWith(BUILDINGS_LAYER, {
        collection: buildings, type: 'buildings', loadConfig: { buildingsZeroHeight: true },
    });
    for (const name of [ROADS_LAYER, 'table_osm_surface']) {
        expect(map.loadCollection.mock.calls.find(([id]) => id === name)?.[1].loadConfig).toBeUndefined();
    }
    expect(map.loadCollection).toHaveBeenCalledTimes(3);
    expect(getLayer).toHaveBeenCalledExactlyOnceWith('table_osm_surface');
    expect(buildings.features[0].properties).toEqual({ building: 'yes' });
});
