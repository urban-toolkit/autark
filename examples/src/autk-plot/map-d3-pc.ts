
import { FeatureCollection } from 'geojson';

import { ParallelCoordinates, PlotEvent } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';

export class MapParallelCoordinates {
    protected map!: AutkMap;
    protected plot!: ParallelCoordinates;

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

        this.map.loadGeoJsonLayer('neighborhoods', this.geojson);
        this.map.updateRenderInfoProperty('neighborhoods', 'isPick', true);

        this.map.draw();
    }

    protected async loadAutkPlot(plotDiv: HTMLElement) {
        this.plot = new ParallelCoordinates({
            div: plotDiv,
            data: this.geojson,
            labels: { 
                axis: ['shape_area', 'shape_leng', 'cdta2020'], 
                title: 'Neighborhood Characteristics' 
            },
            width: 790,
            events: [PlotEvent.BRUSH_Y]
        });
    }

    protected async updateMapListeners() {
        this.map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[]) => {
            this.plot.setHighlightedIds(selection);
        });
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods') {
        this.plot.plotEvents.addEventListener(PlotEvent.CLICK, (selection: number[]) => {
            const layer = <VectorLayer>this.map.layerManager.searchByLayerId(layerId);
            if (layer) {
                layer.setHighlightedIds(selection);
            }
        });
    }

}

async function main() {
    const example = new MapParallelCoordinates();

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdy = document.querySelector('#plotBody') as HTMLElement;

    if (!canvas || !plotBdy) {
        console.error('Canvas or plot body element not found');
        return;
    }

    await example.run(canvas, plotBdy);
}
main();
