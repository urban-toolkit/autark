import { AutkMap } from '@urban-toolkit/autk-map';
import { exampleVariant, onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const style = exampleVariant('Style', { apple: 'Apple', light: 'Light', poster: 'Poster', custom: 'Custom palette' });
    const collection = await fetch(`${BASE_URL}data/mnt_neighs_proj.geojson`).then(response => response.json());

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    if (style === 'custom') {
        map.style.setCustomStyle({
            background: '#f7f5ef', surface: '#eee8db', parks: '#c4d9b0', water: '#b6d7e8',
            roads: '#ffffff', buildings: '#c8b9a7', points: '#7c3aed', polylines: '#3451b2', polygons: '#d6c5a3',
        });
    } else map.style.setPredefinedStyle(style as 'apple' | 'light' | 'poster');
    await map.init();

    map.loadCollection('neighborhoods', { collection });
    map.fitBounds();
    map.draw();
}
void runExample(main);
