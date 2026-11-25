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
        type: 'boxplot',
        collection,
        attributes: { axis: ['cdta2020', 'shape_area', '@transform'] },
        labels: { title: 'Area by district', axis: ['District', 'Area'] },
        transform: { preset: 'box-stats' },
        width: 'auto',
        height: 380,
        events: [PlotEvent.CLICK, PlotEvent.HOVER],
    });

    map.updateRenderInfo('neighborhoods', { isHover: true });
    map.events.on(MapEvent.CLICK, ({ selection }) => plot.setSelection(selection));
    map.events.on(MapEvent.HOVER, ({ selection, source }) => {
        if (source === 'pointer') plot.setHover(selection);
    });
    plot.events.on(PlotEvent.CLICK, ({ selection }) => map.setSelection('neighborhoods', selection));
    plot.events.on(PlotEvent.HOVER, ({ selection }) =>
        map.setSelection('neighborhoods', [...new Set([...plot.selection, ...selection])]));
}
void runExample(main);
