import { runExample } from '../example';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const BASE_URL = (import.meta as any).env.BASE_URL;
const LAYER = 'neighborhoods';

async function main(): Promise<void> {
    const collection = await fetch(`${BASE_URL}data/mnt_neighs_proj.geojson`).then(response => response.json());

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    map.loadCollection(LAYER, { collection });
    map.updateRenderInfo(LAYER, { isClick: true });
    map.fitBounds();
    map.draw();

    const scatter = new AutkPlot(document.querySelector<HTMLElement>('#plotScatter')!, {
        type: 'scatterplot',
        collection,
        attributes: { axis: ['shape_area', 'shape_leng'] },
        labels: { title: 'Area and perimeter', axis: ['Area', 'Perimeter'] },
        width: 'auto',
        height: 280,
        events: [PlotEvent.CLICK, PlotEvent.HOVER],
    });
    const histogram = new AutkPlot(document.querySelector<HTMLElement>('#plotHistogram')!, {
        type: 'barchart',
        collection,
        attributes: { axis: ['shape_area', '@transform'] },
        labels: { title: 'Neighborhoods by area', axis: ['Area', 'Neighborhoods'] },
        transform: { preset: 'binning-1d', options: { bins: 10 } },
        width: 'auto',
        height: 220,
        events: [PlotEvent.BRUSH_X, PlotEvent.HOVER],
    });

    const highlight = (selection: number[]) => map.setSelection(LAYER, selection);

    map.updateRenderInfo(LAYER, { isHover: true });
    map.events.on(MapEvent.CLICK, ({ selection }) => {
        scatter.setSelection(selection);
        histogram.setSelection(selection);
    });
    map.events.on(MapEvent.HOVER, ({ selection, source }) => {
        if (source !== 'pointer') return;
        scatter.setHover(selection);
        histogram.setHover(selection);
    });

    scatter.events.on(PlotEvent.CLICK, ({ selection }) => {
        highlight(selection);
        histogram.setSelection(selection);
    });
    scatter.events.on(PlotEvent.HOVER, (event) => {
        map.setHover(LAYER, event.selection);
        histogram.setHover(event.selection);
    });

    histogram.events.on(PlotEvent.BRUSH_X, ({ selection }) => {
        highlight(selection);
        scatter.setSelection(selection);
    });
    histogram.events.on(PlotEvent.HOVER, (event) => {
        map.setHover(LAYER, event.selection);
        scatter.setHover(event.selection);
    });
}
void runExample(main);
