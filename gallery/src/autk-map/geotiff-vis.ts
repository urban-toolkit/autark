import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
        queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads'] },
    });
    await db.loadGeoTiff({ geotiffFileUrl: `${BASE_URL}data/lower_mnt_dem.tif`, coordinateFormat: 'EPSG:3857', outputTableName: 'dem' });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
    }
    // A raster keeps its own extent; getRaster returns its band arrays.
    map.loadCollection('dem', { collection: await db.getRaster('dem'), type: 'raster', property: 'band_1' });
    map.updateRenderInfo('dem', { opacity: 0.7 });
    map.fitBounds();
    map.draw();
}
void runExample(main);
