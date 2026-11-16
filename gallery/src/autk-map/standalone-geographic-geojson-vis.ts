import { AutkMap } from '@urban-toolkit/autk-map';
import { registerCrs, reprojectFeatureCollection, reprojectPosition } from '@urban-toolkit/autk-core';
import { exampleVariant, onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    registerCrs('LOCAL:NY_UTM', '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs');
    const sourceCrs = exampleVariant('Input CRS', { 'EPSG:4326': 'Longitude / latitude', 'EPSG:3395': 'World Mercator', 'LOCAL:NY_UTM': 'UTM zone 18N' }, 'source');
    const crs = exampleVariant('Workspace CRS', { 'EPSG:3395': 'World Mercator', 'EPSG:3857': 'Web Mercator', 'LOCAL:NY_UTM': 'UTM zone 18N', 'EPSG:4326': 'Longitude / latitude' }, 'workspace');
    const response = await fetch(`${BASE_URL}data/mnt_neighs.geojson`);
    if (!response.ok) throw new Error(`Could not load neighborhoods: HTTP ${response.status}`);
    const geographic = await response.json();
    // Prepare alternative input encodings of the same dataset, without changing its features.
    const collection = sourceCrs === 'EPSG:4326' ? geographic : reprojectFeatureCollection(geographic, 'EPSG:4326', sourceCrs);
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!, true, { crs });
    onExampleDispose(() => map.destroy());
    await map.init();
    map.setView({ center: { latitude: 40.7831, longitude: -73.9712 }, zoom: 12 });
    map.loadCollection('neighborhoods', { collection, sourceCrs });
    map.draw();
    const position = reprojectPosition([-73.9712, 40.7831], 'EPSG:4326', sourceCrs);
    const readout = document.createElement('p'); readout.className = 'example-note';
    readout.textContent = `Center in input CRS: ${position.map(value => value.toFixed(4)).join(', ')} → workspace: ${reprojectPosition(position, sourceCrs, crs).map(value => value.toFixed(4)).join(', ')}`;
    document.querySelector('.controls')!.after(readout);
    onExampleDispose(() => readout.remove());
}
void runExample(main);
