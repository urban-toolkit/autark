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
        type: 'table',
        collection,
        attributes: { axis: ['ntaname', 'shape_area', 'shape_leng'] },
        labels: { axis: ['Neighborhood', 'Area', 'Perimeter'] },
        style: { columnFormats: { shape_area: ',.0f', shape_leng: ',.0f' } },
        transform: { preset: 'sort', options: { direction: 'asc' } },
        width: 'auto',
        events: [PlotEvent.CLICK, PlotEvent.HOVER],
    });

    map.events.on(MapEvent.CLICK, ({ selection }) => plot.setSelection(selection));
    plot.events.on(PlotEvent.CLICK, ({ selection }) => map.setHighlightedIds('neighborhoods', selection));
    plot.events.on(PlotEvent.HOVER, ({ selection }) =>
        map.setHighlightedIds('neighborhoods', [...new Set([...plot.selection, ...selection])]));
}
void runExample(main);
