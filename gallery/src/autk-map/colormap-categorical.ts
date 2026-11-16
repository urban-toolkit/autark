import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/mnt_roads.geojson`, outputTableName: 'roads' });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    map.style.setPredefinedStyle('light');
    await map.init();

    const roads = await db.getLayer('roads');
    map.loadCollection('roads', { collection: roads, type: 'roads' });
    map.updateColorMap('roads', { colorMap: {
        interpolator: ColorMapInterpolator.CAT_OBSERVABLE10,
        domainSpec: { type: ColorMapDomainStrategy.USER, params: ['primary', 'secondary', 'other'] },
    } });
    map.updateThematic('roads', { collection: roads, property: 'properties.highway' });
    map.fitBounds();
    map.draw();
}
void runExample(main);
