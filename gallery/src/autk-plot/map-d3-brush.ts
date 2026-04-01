import { FeatureCollection } from 'geojson';

import { PlotD3, PlotEvent, Scatterplot } from 'autk-plot';

import { AutkMap, MapEvent, VectorLayer } from 'autk-map';

export class MapD3 {
    protected map!: AutkMap;
    protected plot!: PlotD3;

    protected geojson!: FeatureCollection;

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch('http://localhost:5173/data/mnt_neighs_proj.geojson').then(res => res.json());

        await this.loadAutkMap(canvas);
        await this.loadAutkPlot(plotDiv);

        this.updateMapListeners();
        this.updatePlotListeners();
    }


    protected async loadAutkMap(canvas: HTMLCanvasElement) {
        this.map = new AutkMap(canvas);
        await this.map.init();

        this.map.loadCollection({ id: 'neighborhoods', collection: this.geojson });
        this.map.updateLayerRenderInfo('neighborhoods', { isPick: true });

        this.map.draw();
    }

    protected async loadAutkPlot(plotDiv: HTMLElement) {
        this.plot = new Scatterplot({
            div: plotDiv,
            collection: this.geojson,
            labels: { axis: ['shape_area', 'shape_leng'], title: 'Plot example' },
            width: 790,
            events: [PlotEvent.BRUSH]
        });
    }

    protected async updateMapListeners() {
        this.map.events.addListener(MapEvent.PICKING, ({ selection }) => {
            this.plot.setHighlightedIds(selection);
        });
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods') {
        this.plot.events.addListener(PlotEvent.BRUSH, ({ selection }) => {
            const layer = <VectorLayer> this.map.layerManager.searchByLayerId(layerId);
            layer!.setHighlightedIds(selection);
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
