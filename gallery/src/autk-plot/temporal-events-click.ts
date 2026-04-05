import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

import { AutkChart, ChartEvent } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class MapD3TemporalEvents {
    protected map!: AutkMap;
    protected plot!: AutkChart;
    protected plotDiv!: HTMLElement;

    protected geojson!: FeatureCollection<Geometry, GeoJsonProperties>;

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch(`${URL}/data/mnt_neighs_proj.geojson`).then(res => res.json());
        this.plotDiv = plotDiv;

        this.attachSyntheticEvents();
        await this.loadAutkMap(canvas);
        this.initPlot();
        this.updateMapListeners();
    }

    protected attachSyntheticEvents(): void {
        const months = [
            '2025-01-12T12:00:00Z',
            '2025-02-14T12:00:00Z',
            '2025-03-18T12:00:00Z',
            '2025-04-09T12:00:00Z',
        ];

        this.geojson.features.forEach((feature, index) => {
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const base = (index % months.length);
            props.events = [
                { timestamp: months[base], weight: 1 + (index % 3) },
                { timestamp: months[(base + 1) % months.length], weight: 2 + (index % 2) },
                { timestamp: months[(base + 2) % months.length], weight: 1 },
            ];
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
            labels: { axis: ['bucket', 'value'], title: 'Monthly synthetic events (neighborhoods)' },
            transform: {
                preset: 'temporal-events',
                attributes: {
                    events: 'events',
                    timestamp: 'timestamp',
                    value: 'weight',
                },
                options: {
                    resolution: 'month',
                    reducer: 'sum',
                },
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
    const example = new MapD3TemporalEvents();

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdy = document.querySelector('#plotBody') as HTMLElement;

    if (!canvas || !plotBdy) {
        console.error('Canvas or plot body element not found');
        return;
    }

    await example.run(canvas, plotBdy);
}

void main();
