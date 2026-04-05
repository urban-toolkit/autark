import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

import { AutkChart, ChartEvent } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class MapD3Timeseries {
    protected map!: AutkMap;
    protected plot!: AutkChart;
    protected plotDiv!: HTMLElement;

    protected geojson!: FeatureCollection<Geometry, GeoJsonProperties>;

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch(`${URL}/data/mnt_neighs_proj.geojson`).then(res => res.json());
        this.plotDiv = plotDiv;

        this.attachSyntheticTimeseries();
        await this.loadAutkMap(canvas);
        this.initPlot();
        this.updateMapListeners();
    }

    protected attachSyntheticTimeseries(): void {
        const years = ['2021', '2022', '2023', '2024'];

        this.geojson.features.forEach((feature, index) => {
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const base = 10 + (index % 7);
            props.series = years.map((year, yearIndex) => ({
                timestamp: year,
                value: base + yearIndex * (1 + (index % 3)),
            }));
            feature.properties = props as GeoJsonProperties;
        });
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
            labels: { axis: ['bucket', 'value'], title: 'Average synthetic timeseries (neighborhoods)' },
            transform: {
                preset: 'timeseries',
                attributes: {
                    series: 'series',
                    timestamp: 'timestamp',
                    value: 'value',
                },
                options: { reducer: 'avg' },
            },
            margins: { left: 60, right: 20, top: 50, bottom: 140 },
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
    const example = new MapD3Timeseries();

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdy = document.querySelector('#plotBody') as HTMLElement;

    if (!canvas || !plotBdy) {
        console.error('Canvas or plot body element not found');
        return;
    }

    await example.run(canvas, plotBdy);
}

void main();
