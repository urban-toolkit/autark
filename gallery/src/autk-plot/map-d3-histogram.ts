import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Point } from 'geojson';

import { AutkChart, ChartEvent, type AutkDatum } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';

type SourceProperties = GeoJsonProperties & AutkDatum;
type SourceCollection = FeatureCollection<Geometry, GeoJsonProperties>;
type PlotCollection = FeatureCollection<Point, GeoJsonProperties>;

action();

function action() {
    void main();
}

export class MapD3Histogram {
    protected map!: AutkMap;
    protected plot!: AutkChart;
    protected plotDiv!: HTMLElement;

    protected geojson!: SourceCollection;
    protected selectedIds: number[] = [];

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch('/data/mnt_neighs_proj.geojson').then(res => res.json());
        this.plotDiv = plotDiv;

        await this.loadAutkMap(canvas);
        this.renderPlot();
        this.updateMapListeners();
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
            labels: { axis: ['label', 'count'], title: 'Area histogram (selected neighborhoods)' },
            transform: {
                preset: 'histogram',
                attributes: {
                    value: 'shape_area',
                },
                options: {
                    bins: 8,
                    divisor: 1_000_000,
                    labelSuffix: 'M',
                },
            },
            margins: { left: 60, right: 20, top: 50, bottom: 180 },
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
    const example = new MapD3Histogram();

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdy = document.querySelector('#plotBody') as HTMLElement;

    if (!canvas || !plotBdy) {
        console.error('Canvas or plot body element not found');
        return;
    }

    await example.run(canvas, plotBdy);
}
