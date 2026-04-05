import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Point } from 'geojson';

import { AutkChart, ChartEvent, type AutkDatum } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';

type EventItem = { timestamp: string; weight: number };
type SourceProperties = GeoJsonProperties & AutkDatum & { events?: EventItem[] };
type SourceCollection = FeatureCollection<Geometry, GeoJsonProperties>;
type PlotCollection = FeatureCollection<Point, GeoJsonProperties>;

export class MapD3TemporalEvents {
    protected map!: AutkMap;
    protected plot!: AutkChart;
    protected plotDiv!: HTMLElement;

    protected geojson!: SourceCollection;
    protected selectedIds: number[] = [];

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch('/data/mnt_neighs_proj.geojson').then(res => res.json());
        this.plotDiv = plotDiv;

        this.attachSyntheticEvents();
        await this.loadAutkMap(canvas);
        this.renderPlot();
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

    protected renderPlot(): void {
        const sourceRows = this.getSourceRows();
        const collection = this.toPlotCollection(sourceRows, 'shape_area');

        this.plotDiv.innerHTML = '';
        this.plot = new AutkChart(this.plotDiv, {
            type: 'barchart',
            collection,
            labels: { axis: ['bucket', 'value'], title: 'Monthly synthetic events (selected neighborhoods)' },
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

        this.updatePlotListeners();
        this.plot.setSelection(this.selectedIds);
    }

    protected updateMapListeners(): void {
        this.map.events.on(MapEvent.PICKING, ({ selection }) => {
            this.selectedIds = selection;

            const layer = this.map.layerManager.searchByLayerId('neighborhoods') as VectorLayer;
            layer?.setHighlightedIds(selection);

            this.renderPlot();
        });
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods'): void {
        this.plot.events.on(ChartEvent.CLICK, ({ selection }) => {
            const layer = this.map.layerManager.searchByLayerId(layerId) as VectorLayer;
            layer?.setHighlightedIds(selection);
        });
    }

    protected getSourceRows(): SourceProperties[] {
        const features = this.selectedIds.length > 0
            ? this.selectedIds.map(id => this.geojson.features[id]).filter((feature): feature is Feature<Geometry, GeoJsonProperties> => Boolean(feature))
            : this.geojson.features;

        return features.map((feature) => {
            const featureIndex = this.geojson.features.indexOf(feature);
            return {
                ...(feature.properties ?? {}),
                autkIds: [featureIndex],
            } as SourceProperties;
        });
    }

    protected toPlotCollection(rows: Array<GeoJsonProperties & AutkDatum>, valueKey: string): PlotCollection {
        return {
            type: 'FeatureCollection',
            features: rows.map((row, index) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [index, Number(row[valueKey] ?? 0)],
                },
                properties: row,
            })),
        };
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
