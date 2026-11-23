import { runExample } from '../example';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const collection = await fetch(`${BASE_URL}data/mnt_neighs_proj.geojson`).then(response => response.json());

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    map.loadCollection('neighborhoods', { collection });
    map.updateRenderInfo('neighborhoods', { isPick: true });
    map.fitBounds();
    map.draw();

    const body = document.querySelector<HTMLElement>('#plotBody')!;
    const plot = new AutkPlot(body, {
        type: 'heatmatrix',
        collection,
        attributes: { axis: ['shape_area', 'landuse'], color: '@transform' },
        labels: { title: 'Heat matrix' },
        transform: { preset: 'binning-2d' },
        width: Math.max(280, body.clientWidth - 40),
        events: [PlotEvent.CLICK],
    });

    map.events.on(MapEvent.CLICK, ({ selection }) => plot.setSelection(selection));
    plot.events.on(PlotEvent.CLICK, ({ selection }) => map.setHighlightedIds('neighborhoods', selection));
}
void runExample(main);
