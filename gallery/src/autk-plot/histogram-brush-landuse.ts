import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

import { AutkChart, ChartEvent } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class MapD3HistogramLanduse {
    protected map!: AutkMap;
    protected plot!: AutkChart;

    protected geojson!: FeatureCollection<Geometry, GeoJsonProperties>;

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch(`${URL}data/mnt_neighs_proj_landuse.geojson`).then(res => res.json());

        await this.loadAutkMap(canvas);
        await this.loadAutkPlot(plotDiv);

        this.updateMapListeners();
        this.updatePlotListeners();
    }

    protected async loadAutkMap(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();

        this.map.loadCollection({ id: 'neighborhoods', collection: this.geojson });
        this.map.updateRenderInfo('neighborhoods', { isPick: true });

        this.map.draw();
    }

    protected async loadAutkPlot(plotDiv: HTMLElement): Promise<void> {
        this.plot = new AutkChart(plotDiv, {
            type: 'barchart',
            collection: this.geojson,
            attributes: { axis: ['landuse', '@transform'] },
            labels: { axis: ['land use type', 'neighborhoods count'], title: 'Land Use Histogram Example' },
            transform: { preset: 'binning-1d' },
            margins: { left: 60, right: 20, top: 50, bottom: 80 },
            width: 790,
            events: [ChartEvent.BRUSH_X],
        });
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods') {
        this.plot.events.on(ChartEvent.BRUSH_X, ({ selection }) => {
            const layer = this.map.layerManager.searchByLayerId(layerId) as VectorLayer;
            layer?.setHighlightedIds(selection);
        });
    }

    protected updateMapListeners(): void {
        this.map.events.on(MapEvent.PICKING, ({ selection }) => {
            this.plot.setSelection(selection);
        });
    }
}

async function main() {
    const example = new MapD3HistogramLanduse();

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdy = document.querySelector('#plotBody') as HTMLElement;

    if (!canvas || !plotBdy) {
        console.error('Canvas or plot body element not found');
        return;
    }

    await example.run(canvas, plotBdy);
}

void main();