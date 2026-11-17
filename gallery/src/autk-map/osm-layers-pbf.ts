import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { exampleVariant, onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;
const BBOX: [number, number, number, number] = [7.4158, 43.7293, 7.4322, 43.7378];
const db = new AutkDb();
let databaseReady = false;

/** Same three queries as the Overpass example, using only a bundled Monaco extract. */
async function main(): Promise<void> {
    const mode = exampleVariant('PBF query', { bbox: 'Bounding box', place: 'Named place', tags: 'Custom tag filters' });
    if (!databaseReady) { await db.init(); databaseReady = true; }
    await db.setWorkspace(`condamine_${mode}`);
    if (!db.getLayersMetadata().length) {
        await db.loadOsm({
            pbfFileUrl: `${BASE_URL}data/monaco-condamine.osm.pbf`,
            queryArea: mode === 'place' ? { geocodeArea: 'Monaco', areas: ['La Condamine', 'Monaco-Ville'] }
                : { bbox: BBOX },
            autoLoadLayers: { layers: mode === 'tags'
                ? ['surface', 'parks', 'water', 'roads']
                : ['surface', 'parks', 'water', 'roads', 'buildings'] },
            ...(mode === 'tags' ? { tagSets: [
                { name: 'cafes', type: 'points' as const, tags: [{ key: 'amenity', value: 'cafe' }] },
            ] } : {}),
        });
    }

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type,
            loadConfig: { buildingsZeroHeight: true } });
    }
    if (mode === 'tags') map.updateRenderInfo('table_osm_cafes_points', { pointSize: 20 });
    map.fitBounds();
    map.ui.setAttribution([{ text: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }]);
    map.draw();
}
void runExample(main);
