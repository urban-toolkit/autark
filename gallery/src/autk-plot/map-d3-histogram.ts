import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

import { AutkChart, ChartEvent } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';

export class MapD3Histogram {
    protected map!: AutkMap;
    protected plot!: AutkChart;
    protected plotDiv!: HTMLElement;

    protected geojson!: FeatureCollection<Geometry, GeoJsonProperties>;

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch('/data/mnt_neighs_proj.geojson').then(res => res.json());
        this.plotDiv = plotDiv;

        await this.loadAutkMap(canvas);
        this.initPlot();
        this.updateMapListeners();
    }

    protected async loadAutkMap(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();

        this.map.loadCollection({ id: 'neighborhoods', collection: this.geojson });
        this.map.updateRenderInfo('neighborhoods', { isPick: true });
        this.map.draw();
    }

    protected initPlot(): void {
        this.plot = new AutkChart(this.plotDiv, {
            type: 'barchart',
            collection: this.geojson,
            labels: { axis: ['label', 'count'], title: 'Area histogram (neighborhoods)' },
            transform: {
                preset: 'histogram',
                attributes: { value: 'shape_area' },
                options: { bins: 8, divisor: 1_000_000, labelSuffix: 'M' },
            },
            margins: { left: 60, right: 20, top: 50, bottom: 180 },
            width: 790,
            events: [ChartEvent.CLICK],
        });

        this.plot.events.on(ChartEvent.CLICK, ({ selection }) => {
            const layer = this.map.layerManager.searchByLayerId('neighborhoods') as VectorLayer;
            layer?.setHighlightedIds(selection);
        });
    }

    protected updateMapListeners(): void {
        this.map.events.on(MapEvent.PICKING, ({ selection }) => {
            const layer = this.map.layerManager.searchByLayerId('neighborhoods') as VectorLayer;
            layer?.setHighlightedIds(selection);

            this.plot.setSelection(selection);
        });
    }
}

async function main() {
    const example = new MapD3Histogram();

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdy = document.querySelector('#plotBody') as HTMLElement;

    if (!canvas || !plotBdy) {
        console.error('Canvas or plot body element not found');
        return;
    }

    await example.run(canvas, plotBdy);
}

void main();
