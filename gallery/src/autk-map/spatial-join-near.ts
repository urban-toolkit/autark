import { runExample, exampleVariant, onExampleDispose } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const target = exampleVariant('Join near', { roads: 'Roads', buildings: 'Buildings' });
    const layer = target === 'buildings' ? 'table_osm_buildings' : 'table_osm_roads';
    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
        queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
    });
    await db.loadCsv({
        csvFileUrl: `${BASE_URL}data/noise_manhattan_clean.csv`,
        outputTableName: 'noise',
        geometryColumns: { latColumnName: 'latitude', longColumnName: 'longitude' },
        sourceCrs: 'EPSG:4326',
    });

    await db.spatialQuery({
        tableRootName: layer,
        tableJoinName: 'noise',
        near: { distance: 200 },
        groupBy: [{ column: 'key', aggregateFn: 'count' }],
    });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    for (const data of db.getLayersMetadata()) {
        map.loadCollection(data.name, { collection: await db.getLayer(data.name), type: data.type });
    }
    map.updateRenderInfo('noise', { pointSize: 12, color: { r: 46, g: 65, b: 116, alpha: 1 } });
    map.updateThematic(layer, { collection: await db.getLayer(layer), property: 'properties.sjoin.count.noise' });
    map.updateRenderInfo(layer, { isColorMap: true });
    map.fitBounds();
    map.draw();
}
void runExample(main);
