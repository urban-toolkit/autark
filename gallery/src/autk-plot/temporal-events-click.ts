import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/mnt_roads.geojson`, outputTableName: 'roads', coordinateFormat: 'EPSG:3395' });
    await db.loadCsv({ csvFileUrl: `${BASE_URL}data/noise_manhattan_clean.csv`, outputTableName: 'noise',
        geometryColumns: { latColumnName: 'latitude', longColumnName: 'longitude', coordinateFormat: 'EPSG:3395' } });
    await db.spatialQuery({
        tableRootName: 'roads',
        tableJoinName: 'noise',
        near: { distance: 200 },
        groupBy: [{ column: 'key', aggregateFn: 'count' }, { column: 'date', aggregateFn: 'collect' }],
    });
    const roads = await db.getLayer('roads');

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    map.loadCollection('roads', { collection: roads, type: 'roads' });
    map.fitBounds();
    map.draw();

    const body = document.querySelector<HTMLElement>('#plotBody')!;
    const plot = new AutkPlot(body, {
        type: 'linechart',
        collection: roads,
        attributes: { axis: ['sjoin.collect.noise', '@transform'] },
        transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'day', reducer: 'count' } },
        width: Math.max(280, body.clientWidth - 40),
        events: [PlotEvent.BRUSH_X],
    });

    map.events.on(MapEvent.PICKING, ({ selection }) => plot.setSelection(selection));
    plot.events.on(PlotEvent.BRUSH_X, ({ selection }) => map.setHighlightedIds('roads', selection));
}
void runExample(main);
