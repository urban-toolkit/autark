import { runExample } from '../example';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const BASE_URL = (import.meta as any).env.BASE_URL;

async function main(): Promise<void> {
    const collection = await fetch(`${BASE_URL}data/mnt_neighs_proj.geojson`).then(response => response.json());

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    map.loadCollection('neighborhoods', { collection });
    map.updateRenderInfo('neighborhoods', { isClick: true });
    map.fitBounds();
    map.draw();

    const body = document.querySelector<HTMLElement>('#plotBody')!;
    const plot = new AutkPlot(body, {
        type: 'heatmatrix',
        collection,
        attributes: { axis: ['shape_area', 'shape_leng'], color: '@transform' },
        labels: { title: 'Neighborhood area and perimeter', axis: ['Area', 'Perimeter'] },
        transform: { preset: 'binning-2d' },
        width: Math.max(280, body.clientWidth - 40),
        events: [PlotEvent.CLICK, PlotEvent.HOVER],
    });

    map.updateRenderInfo('neighborhoods', { isHover: true });
    map.events.on(MapEvent.CLICK, ({ selection }) => plot.setSelection(selection));
    map.events.on(MapEvent.HOVER, ({ selection, source }) => {
        if (source === 'pointer') plot.setHover(selection);
    });
    plot.events.on(PlotEvent.CLICK, ({ selection }) => map.setSelection('neighborhoods', selection));
    plot.events.on(PlotEvent.HOVER, ({ selection }) => map.setHover('neighborhoods', selection));
}
void runExample(main);
