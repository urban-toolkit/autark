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
        type: 'barchart',
        collection,
        attributes: { axis: ['shape_area', '@transform'] },
        labels: { title: 'Distribution' },
        transform: { preset: 'binning-1d', options: { bins: 10 } },
        width: Math.max(280, body.clientWidth - 40),
        events: [PlotEvent.BRUSH_X, PlotEvent.HOVER],
    });

    map.events.on(MapEvent.CLICK, ({ selection }) => plot.setSelection(selection));
    plot.events.on(PlotEvent.BRUSH_X, ({ selection }) => map.setHighlightedIds('neighborhoods', selection));
    plot.events.on(PlotEvent.HOVER, ({ selection }) =>
        map.setHighlightedIds('neighborhoods', [...new Set([...plot.selection, ...selection])]));
}
void runExample(main);
