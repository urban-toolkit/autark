import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { reprojectPosition } from '@urban-toolkit/autk-core';
import type { FeatureCollection, Point } from 'geojson';
import { exampleVariant, onExampleDispose, runExample } from '../example';

const db = new AutkDb();
let databaseReady = false;

async function main(): Promise<void> {
    const format = exampleVariant('Table format', { csv: 'CSV', json: 'JSON' }, 'format');
    const geometry = exampleVariant('Geometry columns', { coordinates: 'Longitude / latitude columns', wkt: 'WKT column' }, 'geometry');
    // Re-encode the existing national park records as a table so all four variants show the same real features.
    const response = await fetch(`${(import.meta as any).env.BASE_URL}data/mnt_pois_proj.geojson`);
    if (!response.ok) throw new Error(`Could not load parks: HTTP ${response.status}`);
    const points: FeatureCollection<Point> = await response.json();
    const rows = points.features.map(feature => {
        const [Longitude, Latitude] = reprojectPosition(feature.geometry.coordinates, 'EPSG:3395', 'EPSG:4326');
        return { name: String(feature.properties?.['National Park'] ?? 'Park'), Longitude, Latitude, wkt: `POINT (${Longitude} ${Latitude})` };
    });
    const geometryColumns = geometry === 'wkt' ? { wktColumnName: 'wkt' } : { latColumnName: 'Latitude', longColumnName: 'Longitude' };
    if (!databaseReady) { await db.init(); databaseReady = true; }
    await db.setWorkspace(`table_${format}_${geometry}`);
    const loaded = db.getLayersMetadata().some(layer => layer.name === 'parks');
    if (!loaded && format === 'json') await db.loadJson({ jsonObject: rows, geometryColumns, outputTableName: 'parks' });
    else if (!loaded) {
        const csv = ['name,Longitude,Latitude,wkt', ...rows.map(row => Object.values(row).map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        try { await db.loadCsv({ csvFileUrl: url, geometryColumns, outputTableName: 'parks' }); }
        finally { URL.revokeObjectURL(url); }
    }
    const collection = await db.getLayer('parks');
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    map.loadCollection('parks', { collection, type: 'points' });
    map.fitBounds();
    map.draw();
}
void runExample(main);
