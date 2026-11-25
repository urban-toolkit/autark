import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/mnt_neighs.geojson`, outputTableName: 'neighborhoods' });

    for (const table of ['noise', 'parking']) {
        await db.loadCsv({ csvFileUrl: `${BASE_URL}data/${table}.csv`, outputTableName: table, geometryColumns: true });
        await db.spatialQuery({
            tableRootName: 'neighborhoods',
            tableJoinName: table,
            groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
        });
    }

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    const neighborhoods = await db.getLayer('neighborhoods');
    for (const layer of db.getLayersMetadata()) {
        const collection = layer.name === 'neighborhoods' ? neighborhoods : await db.getLayer(layer.name);
        map.loadCollection(layer.name, { collection, type: layer.type });
    }
    map.updateRenderInfo('noise', { isSkip: true });
    map.updateRenderInfo('parking', { isSkip: true });

    const complaint = document.querySelector<HTMLSelectElement>('#select')!;
    const updateThematic = () => map.updateThematic('neighborhoods', {
        collection: neighborhoods,
        property: `properties.sjoin.count.${complaint.value}`,
    });
    updateThematic();
    map.updateRenderInfo('neighborhoods', { isColorMap: true });
    complaint.addEventListener('change', updateThematic);
    map.fitBounds();
    map.draw();
}
void runExample(main);
