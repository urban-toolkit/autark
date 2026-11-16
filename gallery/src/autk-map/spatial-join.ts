import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/mnt_neighs.geojson`, outputTableName: 'neighborhoods' });
    await db.loadCsv({ csvFileUrl: `${BASE_URL}data/noise.csv`, outputTableName: 'noise', geometryColumns: true });

    await db.spatialQuery({
        tableRootName: 'neighborhoods',
        tableJoinName: 'noise',
        groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
    });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    const neighborhoods = await db.getLayer('neighborhoods');
    map.loadCollection('neighborhoods', { collection: neighborhoods });
    map.updateThematic('neighborhoods', { collection: neighborhoods, property: 'properties.sjoin.count.noise' });
    map.fitBounds();
    map.draw();
}
void runExample(main);
