import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { exampleVariant, onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;
const db = new AutkDb();
let databaseReady = false;

async function main(): Promise<void> {
    const input = exampleVariant('GeoJSON input', { url: 'File URL', memory: 'In-memory collection' });
    if (!databaseReady) { await db.init(); databaseReady = true; }
    await db.setWorkspace(`geojson_${input}`);
    const loaded = db.getLayersMetadata().some(layer => layer.name === 'neighborhoods');
    const url = `${BASE_URL}data/mnt_neighs.geojson`;
    if (!loaded && input === 'url') await db.loadGeojson({ geojsonFileUrl: url, outputTableName: 'neighborhoods' });
    else if (!loaded) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load neighborhoods: HTTP ${response.status}`);
        await db.loadGeojson({ geojsonObject: await response.json(), outputTableName: 'neighborhoods' });
    }
    // AutkDb already returns the collection in the shared projected workspace CRS.
    const collection = await db.getLayer('neighborhoods');
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    map.loadCollection('neighborhoods', { collection });
    map.fitBounds();
    map.draw();
}
void runExample(main);
