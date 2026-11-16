import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/mnt_neighs.geojson`, outputTableName: 'neighborhoods' });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();

    const neighborhoods = await db.getLayer('neighborhoods');
    map.loadCollection('neighborhoods', { collection: neighborhoods });
    map.updateColorMap('neighborhoods', { colorMap: {
        interpolator: ColorMapInterpolator.DIV_SPECTRAL,
        domainSpec: { type: ColorMapDomainStrategy.PERCENTILE },
    } });
    map.updateThematic('neighborhoods', { collection: neighborhoods, property: 'properties.shape_area' });
    map.fitBounds();
    map.draw();
}
void runExample(main);
