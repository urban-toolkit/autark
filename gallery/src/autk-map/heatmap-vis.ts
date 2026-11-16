import { runExample, exampleVariant } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const resolution = exampleVariant('Grid resolution', { standard: '30 × 30', fine: '60 × 60' });
    const cells = resolution === 'fine' ? 60 : 30;

    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
        queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads'] },
    });
    await db.loadCsv({ csvFileUrl: `${BASE_URL}data/noise.csv`, outputTableName: 'noise', geometryColumns: true });

    await db.buildHeatmap({
        tableJoinName: 'noise',
        near: { distance: 1000 },
        outputTableName: 'heatmap',
        grid: { rows: cells, columns: cells },
        groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
    });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
    }
    map.loadCollection('heatmap', { collection: await db.getRaster('heatmap'), type: 'raster', property: 'band_1' });
    map.updateRenderInfo('heatmap', { opacity: 0.5 });
    map.fitBounds();
    map.draw();
}
void runExample(main);
