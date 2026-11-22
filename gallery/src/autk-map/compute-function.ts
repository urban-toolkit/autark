import { runExample, exampleVariant } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { ComputeGpgpu } from '@urban-toolkit/autk-compute';
import { AutkMap } from '@urban-toolkit/autk-map';
import { ROAD_LENGTH_WGSL } from './road-length';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const input = exampleVariant('Input', { polygons: 'Neighborhood compactness', roads: 'Road lengths' });
    const db = new AutkDb();
    await db.init();

    let collection, layer;
    if (input === 'roads') {
        await db.loadOsm({
            pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
            queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
            autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads'] },
        });
        layer = 'table_osm_roads';
        collection = await db.getLayer(layer);
    } else {
        await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/mnt_neighs.geojson`, outputTableName: 'neighborhoods' });
        layer = 'neighborhoods';
        collection = await db.getLayer(layer);
    }

    const result = await new ComputeGpgpu().run({
        collection,
        variableMapping: input === 'roads' ? { road: 'geometry' } : { x: 'shape_area', y: 'shape_leng' },
        resultField: 'result',
        wgslBody: input === 'roads' ? ROAD_LENGTH_WGSL : 'return (4 * 3.1415927 * x) / (y * y);',
    });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    for (const data of db.getLayersMetadata()) {
        map.loadCollection(data.name, { collection: data.name === layer ? result : await db.getLayer(data.name), type: data.type });
    }
    map.updateThematic(layer, { collection: result, property: 'properties.compute.result' });
    map.fitBounds();
    map.draw();
}
void runExample(main);
