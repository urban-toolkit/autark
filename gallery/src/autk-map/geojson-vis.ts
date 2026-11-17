import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { exampleVariant, onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;
const db = new AutkDb();
let databaseReady = false;

/** One workspace per city: their tables never mix. */
const CITIES: Record<string, { file: string; table: string; label: string; input: 'url' | 'object' }> = {
    paris: { file: 'paris-arrondissements.geojson', table: 'arrondissements', label: 'Paris arrondissements', input: 'url' },
    new_york: { file: 'mnt_neighs.geojson', table: 'neighborhoods', label: 'Manhattan neighborhoods', input: 'object' },
    chicago: { file: 'chi-community-areas.geojson', table: 'community_areas', label: 'Chicago community areas', input: 'object' },
};

async function main(): Promise<void> {
    const city = exampleVariant('Workspace', {
        paris: 'paris',
        new_york: 'new_york',
        chicago: 'chicago',
    }, 'workspace');
    const { file, table, label, input } = CITIES[city]!;
    document.querySelector('#map-title')!.textContent = label;

    if (!databaseReady) { await db.init(); databaseReady = true; }
    await db.setWorkspace(city);

    // Each workspace keeps its own tables; revisiting a city skips the import.
    if (!db.getLayersMetadata().some(layer => layer.name === table)) {
        const url = `${BASE_URL}data/${file}`;
        if (input === 'url') await db.loadGeojson({ geojsonFileUrl: url, outputTableName: table });
        else {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not load ${file}: HTTP ${response.status}`);
            await db.loadGeojson({ geojsonObject: await response.json(), outputTableName: table });
        }
    }

    // AutkDb already returns the collection in the shared projected workspace CRS.
    const collection = await db.getLayer(table);
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!, { showUi: false });
    onExampleDispose(() => map.destroy());
    await map.init();
    map.loadCollection(table, { collection, type: 'polygons' });
    map.fitBounds();
    map.draw();
}
void runExample(main);
