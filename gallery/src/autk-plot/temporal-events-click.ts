import { exampleVariant, onExampleDispose, runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const BASE_URL = (import.meta as any).env.BASE_URL;
const db = new AutkDb();
const joined = new Set<string>();
let noiseLoaded = false;

async function main(): Promise<void> {
    const layer = exampleVariant('Group noise reports by', { neighborhoods: 'Neighborhoods', roads: 'Roads' });
    const roads = layer === 'roads';
    if (!noiseLoaded) {
        await db.init();
        await db.loadCsv({ csvFileUrl: `${BASE_URL}data/noise_manhattan_clean.csv`, outputTableName: 'noise',
            geometryColumns: { latColumnName: 'latitude', longColumnName: 'longitude', coordinateFormat: 'EPSG:4326' } });
        noiseLoaded = true;
    }
    if (!joined.has(layer)) {
        await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/${roads ? 'mnt_roads' : 'mnt_neighs'}.geojson`,
            outputTableName: layer, coordinateFormat: 'EPSG:4326' });
        // Counts color the map; the matched dates feed the chart.
        await db.spatialQuery({
            tableRootName: layer, tableJoinName: 'noise',
            ...(roads ? { near: { distance: 200 } } : {}),
            groupBy: [{ column: 'key', aggregateFn: 'count' }, { column: 'date', aggregateFn: 'collect' }],
        });
        joined.add(layer);
    }
    const collection = await db.getLayer(layer);

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    onExampleDispose(() => map.destroy());
    map.loadCollection(layer, { collection, ...(roads ? { type: 'roads' } : {}) });
    const widths = map.layerManager.searchByLayerId(layer)?.layerRenderInfo.polylinesWidthByComponent;
    map.updateRenderInfo(layer, { isPick: true, ...(widths ? { polylinesWidthByComponent: widths.map(width => width * 2.5) } : {}) });
    map.updateThematic(layer, { collection, property: 'properties.sjoin.count.noise' });
    map.setView({ center: { latitude: 40.724, longitude: -73.998 }, zoom: 13.6 });
    map.draw();

    const body = document.querySelector<HTMLElement>('#plotBody')!;
    const plot = new AutkPlot(body, {
        type: 'linechart',
        collection,
        attributes: { axis: ['sjoin.collect.noise', '@transform'] },
        labels: { title: roads ? 'Noise reports near roads' : 'Noise reports by neighborhood',
            axis: ['Date', roads ? 'Road–report matches' : 'Neighborhood–report matches'] },
        transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'day', reducer: 'count' } },
        width: 'auto',
        events: [PlotEvent.BRUSH_X, PlotEvent.HOVER],
    });
    onExampleDispose(() => plot.destroy());

    map.events.on(MapEvent.CLICK, ({ selection }) => plot.setSelection(selection));
    plot.events.on(PlotEvent.BRUSH_X, ({ selection }) => map.setHighlightedIds(layer, selection));
    plot.events.on(PlotEvent.HOVER, ({ selection }) =>
        map.setHighlightedIds(layer, [...new Set([...plot.selection, ...selection])]));
    document.querySelector('#join-description')!.textContent = roads
        ? 'Reports match every road within 200 m, so one report can count toward several roads.'
        : 'Reports match neighborhood boundaries by location.';
}
void runExample(main);
