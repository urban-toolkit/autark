import { FeatureCollection } from 'geojson';

import { AutkChart, ChartEvent } from 'autk-plot';
import { AutkMap, VectorLayer } from 'autk-map';
import { MapEvent } from 'autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class MapD3 {
    protected map!: AutkMap;
    protected plot!: AutkChart;

    protected geojson!: FeatureCollection;

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch(`${URL}data/mnt_neighs_proj_landuse.geojson`).then(res => res.json());

        await this.loadAutkMap(canvas);
        await this.loadAutkPlot(plotDiv);

        this.updateMapListeners();
        this.updatePlotListeners();
    }

    protected async loadAutkMap(canvas: HTMLCanvasElement) {
        this.map = new AutkMap(canvas);
        await this.map.init();

        this.map.loadCollection({ id: 'neighborhoods', collection: this.geojson });
        this.map.updateRenderInfo('neighborhoods', { isPick: true });

        this.map.draw();
    }

    protected async loadAutkPlot(plotDiv: HTMLElement) {
        this.plot = new AutkChart(plotDiv, {
            type: 'heatmatrix',
            collection: this.geojson,
            attributes: { axis: ['shape_area', 'landuse'], color: '@transform' },
            labels: { axis: ['Shape Area', 'Land Use'], title: 'Neighborhoods by Area and Land Use' },
            transform: {
                preset: 'binning-2d',
                options: { binsX: 5 }
            },
            margins: { left: 100, right: 20, top: 50, bottom: 80 },
            width: 790,
            events: [ChartEvent.CLICK]
        });
    }

    protected async updateMapListeners() {
        this.map.events.on(MapEvent.PICKING, ({ selection }) => {
            this.plot.setSelection(selection);
        });
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods') {
        this.plot.events.on(ChartEvent.CLICK, ({ selection }) => {
            const layer = <VectorLayer>this.map.layerManager.searchByLayerId(layerId);
            if (layer) {
                layer.setHighlightedIds(selection);
            }
        });
    }
}

async function main() {
    const example = new MapD3();
    
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdy = document.querySelector('#plotBody') as HTMLElement;

    if (!canvas || !plotBdy) {
        console.error('Canvas or plot body element not found');
        return;
    }

    await example.run(canvas, plotBdy);
}
main();
