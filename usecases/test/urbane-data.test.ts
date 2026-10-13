import { expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ loadOsm: vi.fn(), loadGeojson: vi.fn(), spatialQuery: vi.fn() }));
vi.mock('@urban-toolkit/autk-db', () => ({ AutkDb: class {
    init = vi.fn();
    loadOsm = calls.loadOsm;
    loadGeojson = calls.loadGeojson;
    spatialQuery = calls.spatialQuery;
} }));

import { UrbaneData } from '../src/urbane/data';

it('loads the completed borough PBF by administrative name, not an island or bounding box', async () => {
    const data = new UrbaneData();
    await data.init();
    await data.loadBaseData([]);
    const params = calls.loadOsm.mock.calls[0][0];
    expect(params.pbfFileUrl).toMatch(/data\/mnt-administrative-geocode-coastlines\.osm\.pbf$/);
    expect(params.queryArea).toEqual({ geocodeArea: 'New York', areas: ['Manhattan'] });
    expect(params.autoLoadLayers.layers).toEqual(['surface', 'parks', 'water', 'roads', 'buildings']);
});
