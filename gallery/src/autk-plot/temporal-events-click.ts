import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

import { AutkSpatialDb, LayerType } from 'autk-db';
import { AutkMap, MapEvent, MapStyle, VectorLayer } from 'autk-map';
import { AutkChart, ChartEvent } from 'autk-plot';

const URL = (import.meta as any).env.BASE_URL;

export class MapD3TemporalEvents {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;
    protected plot!: AutkChart;

    protected canvas!: HTMLCanvasElement;
    protected plotDiv!: HTMLElement;

    protected roads!: FeatureCollection<Geometry, GeoJsonProperties>;

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.canvas = canvas;
        this.plotDiv = plotDiv;

        await this.loadData();
        await this.loadMap();
        await this.loadPlot();
    }

    protected async loadData(): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}data/mnt_roads.geojson`,
            outputTableName: 'roads',
            coordinateFormat: 'EPSG:3395'
        });

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise_manhattan_clean.csv`,
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'latitude',
                longColumnName: 'longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        await this.db.spatialQuery({
            tableRootName: 'roads',
            tableJoinName: 'noise',
            spatialPredicate: 'NEAR',
            nearDistance: 200,
            output: {
                type: 'MODIFY_ROOT',
            },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: [
                    {
                        tableName: 'noise',
                        column: 'key',
                        aggregateFn: 'count',
                    },
                    {
                        tableName: 'noise',
                        column: 'date',
                        aggregateFn: 'collect',
                    }
                ],
            },
        });

        this.roads = await this.db.getLayer('roads');
    }

    protected async loadMap(): Promise<void> {
        this.map = new AutkMap(this.canvas);
        MapStyle.setPredefinedStyle('light');

        await this.map.init();
        await this.loadLayers();

        this.map.draw();

        this.map.events.on(MapEvent.PICKING, ({ selection }) => {
            this.plot.setSelection(selection);
        });
    }

    protected loadPlot() {
        this.plot = new AutkChart(this.plotDiv, {
            type: 'linechart',
            collection: this.roads,
            attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            labels: { axis: ['buckets', 'count'], title: 'Monthly noise events per road' },
            transform: {
                preset: 'binning-events',
                options: {
                    timestamp: 'date',
                    resolution: 'day',
                    reducer: 'count',
                },
            },
            margins: { left: 60, right: 20, top: 50, bottom: 140 },
            width: 790,
            events: [ChartEvent.BRUSH_X],
        });

        this.plot.events.on(ChartEvent.BRUSH_X, ({ selection }) => {
            const layer = this.map.layerManager.searchByLayerId('roads') as VectorLayer;
            layer?.setHighlightedIds(selection);
        });
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateThematic('roads', { collection: this.roads, property: 'properties.sjoin.count.noise' });
        this.map.updateRenderInfo('roads', { isPick: true });
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
