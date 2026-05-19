
import { FeatureCollection } from 'geojson';

import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';
import { AutkMap } from '@urban-toolkit/autk-map';
import { MapEvent } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class MapD3 {
    protected map!: AutkMap;
    protected plot!: AutkPlot;

    protected geojson!: FeatureCollection;

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch(`${URL}data/mnt_neighs_proj.geojson`).then(res => res.json());

        await this.loadAutkMap(canvas);
        await this.loadAutkPlot(plotDiv);

        this.updateMapListeners();
        this.updatePlotListeners();
    }

    protected async loadAutkMap(canvas: HTMLCanvasElement) {
        this.map = new AutkMap(canvas);
        await this.map.init();

        this.map.loadCollection('neighborhoods', { collection: this.geojson });
        this.map.updateRenderInfo('neighborhoods', { isPick: true });

        this.map.draw();
    }

    protected async loadAutkPlot(plotDiv: HTMLElement) {
        this.plot = new AutkPlot(plotDiv, {
            type: 'scatterplot',
            collection: this.geojson,
            attributes: { axis: ['shape_area', 'shape_leng'] },
            labels: { axis: ['Area', 'Length'], title: 'Plot example' },
            width: 790,
            events: [PlotEvent.CLICK]
        });
    }

    protected async updateMapListeners() {
        this.map.events.on(MapEvent.PICKING, ({ selection }) => {
            if (selection.length > 0) {
                this.plot.setSelection(selection);
            } else {
                this.plot.setSelection([]);
            }
        });
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods') {
        this.plot.events.on(PlotEvent.CLICK, ({ selection }) => {
            this.map.setHighlightedIds(layerId, selection);
        });
    }

}

async function main() {
    const example = new MapD3();

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdy = document.querySelector('#plotBody') as HTMLElement;

    if (!canvas || !plotBdy) {
        console.error('Canvas element not found');
        return;
    }

    await example.run(canvas, plotBdy);
}
main();
