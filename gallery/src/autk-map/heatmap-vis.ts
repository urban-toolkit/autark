import { runExample, exampleVariant, onExampleDispose } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const resolution = exampleVariant('Grid resolution', { standard: '60 × 60', fine: '120 × 120' });
    const cells = resolution === 'fine' ? 120 : 60;

    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
        queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads'] },
    });
    await db.loadCsv({
        csvFileUrl: `${BASE_URL}data/noise_manhattan_clean.csv`,
        outputTableName: 'noise',
        geometryColumns: { latColumnName: 'latitude', longColumnName: 'longitude' },
        sourceCrs: 'EPSG:4326',
    });

    await db.buildHeatmap({
        tableJoinName: 'noise',
        near: { distance: 200 },
        outputTableName: 'heatmap',
        grid: { rows: cells, columns: cells },
        smoothingSigma: cells / 40,
        groupBy: [{ column: 'key', aggregateFn: 'count' }],
    });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    for (const layer of db.getLayersMetadata()) {
        map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
    }
    map.loadCollection('heatmap', { collection: await db.getRaster('heatmap'), type: 'raster', property: 'band_1' });
    map.updateRenderInfo('noise', { pointSize: 12, color: { r: 46, g: 65, b: 116, alpha: 1 } });
    map.updateRenderInfo('heatmap', { opacity: 0.5, isColorMap: true });
    map.fitBounds();
    map.draw();
}
void runExample(main);
