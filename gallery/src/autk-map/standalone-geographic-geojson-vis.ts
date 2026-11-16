import { AutkMap } from '@urban-toolkit/autk-map';
import { runExample } from '../example';

const BASE_URL = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

/** Geographic GeoJSON is reprojected by the map; no database or manual conversion is needed. */
async function main(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) throw new Error('Canvas element not found');
    const map = new AutkMap(canvas);
    await map.init();
    map.setView({ center: { latitude: 40.7831, longitude: -73.9712 }, zoom: 12 });

    const response = await fetch(`${BASE_URL}data/mnt_neighs.geojson`);
    if (!response.ok) throw new Error(`Could not load neighborhoods: HTTP ${response.status}`);
    const collection = await response.json();
    map.loadCollection('neighborhoods', { collection, sourceCrs: 'EPSG:4326' });
    map.draw();
    window.addEventListener('pagehide', () => map.destroy(), { once: true });
}

void runExample(main);
