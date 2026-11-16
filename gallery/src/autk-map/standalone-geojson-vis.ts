import { AutkMap } from '@urban-toolkit/autk-map';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import { exampleVariant, onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const geometry = exampleVariant('Geometry', { polygons: 'Neighborhood polygons', lines: 'Neighborhood boundaries', points: 'National park points' });
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    const file = geometry === 'points' ? 'mnt_pois_proj.geojson' : 'mnt_neighs_proj.geojson';
    const response = await fetch(`${BASE_URL}data/${file}`);
    if (!response.ok) throw new Error(`Could not load data: HTTP ${response.status}`);
    const collection = await response.json();
    if (geometry === 'lines') {
        const polygons = collection as FeatureCollection<MultiPolygon>;
        map.loadCollection('boundaries', { type: 'polylines', collection: { type: 'FeatureCollection', features: polygons.features.map(feature => ({ ...feature,
            geometry: { type: 'MultiLineString', coordinates: feature.geometry.coordinates.flat() } })) } });
    } else map.loadCollection(geometry, { collection });
    map.fitBounds();
    map.draw();
}
void runExample(main);
