import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const BASE_URL = (import.meta as any).env.BASE_URL;
const ELEVATION = 'niteroi_elevation';

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/niteroi.osm.pbf`,
        queryArea: { bbox: [-43.14, -22.97, -43.03, -22.85] },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
    });
    await db.loadGeoTiff({ geotiffFileUrl: `${BASE_URL}data/niteroi-elevation.tif`, coordinateFormat: 'EPSG:3395', outputTableName: ELEVATION });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type, loadConfig: { buildingsZeroHeight: true } });
    }

    // A raster source keeps the elevation's own finite coverage.
    map.loadTerrain({ source: { collection: await db.getRaster(ELEVATION), property: 'band_1' } });
    map.ui.setAttribution([
        { text: 'Mapzen', url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md' },
        { text: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
    ]);
    map.draw();
}
void runExample(main);
