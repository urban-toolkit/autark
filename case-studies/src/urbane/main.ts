
import { Feature, FeatureCollection, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, MapEvent, VectorLayer } from 'autk-map';
import { ParallelCoordinates, TableVis, PlotEvent } from 'autk-plot';

export class MapParallelCoordinates {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    protected table!: TableVis;
    protected parallel!: ParallelCoordinates;

    protected neighs!: FeatureCollection;

    public async run(canvas: HTMLCanvasElement, plotDivParallel: HTMLElement, plotDivTable: HTMLElement): Promise<void> {
        await this.loadAutkDb();
        await this.loadAutkMap(canvas);
        await this.loadAutkPlot(plotDivParallel, plotDivTable);

        this.updateMapListeners();
        this.updatePlotListeners();
        this.setupThematicDropdown();
    }

    protected async loadAutkDb() {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });

        // available data
        const datasets = ['noise', 'parking', 'permit', 'taxi'];
        for (const dataset of datasets) {
            await this.loadAndJoin('neighborhoods', dataset);
        }
    }

    protected async loadAutkMap(canvas: HTMLCanvasElement) {
        this.map = new AutkMap(canvas);
        await this.map.init();

        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
            this.neighs = geojson;
        }
        this.map.updateRenderInfoProperty('neighborhoods', 'isPick', true);
        this.map.draw();
    }

    protected async loadAutkPlot(plotDivParallel: HTMLElement, plotDivTable: HTMLElement) {
        this.parallel = new ParallelCoordinates({
            div: plotDivParallel,
            data: this.neighs,
            labels: {
                axis: ['sjoin.count.noise', 'sjoin.count.parking', 'sjoin.count.permit', 'sjoin.count.taxi'],
                title: 'Neighborhood Characteristics'
            },
            width: 790,
            events: [PlotEvent.BRUSH_Y]
        });

        this.table = new TableVis({
            div: plotDivTable,
            data: this.neighs,
            labels: {
                axis: ['ntaname', 'sjoin.count.noise', 'sjoin.count.parking', 'sjoin.count.permit', 'sjoin.count.taxi'],
                title: 'Neighborhood Characteristics'
            },
            width: 790,
            events: [PlotEvent.CLICK]
        });
    }

    protected async updateMapListeners() {
        this.map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[]) => {

            this.table.setHighlightedIds(selection);
            this.parallel.setHighlightedIds(selection);
        });
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods') {
        const layer = <VectorLayer>this.map.layerManager.searchByLayerId(layerId);

        this.table.plotEvents.addEventListener(PlotEvent.CLICK, (selection: number[]) => {
            layer!.setHighlightedIds(selection);
            this.parallel.setHighlightedIds(selection);
        });
        this.parallel.plotEvents.addEventListener(PlotEvent.BRUSH_Y, (selection: number[]) => {
            layer!.setHighlightedIds(selection);
            this.table.setHighlightedIds(selection);
        });
    }

    protected setupThematicDropdown() {
        const select = document.querySelector('#thematicSelect') as HTMLSelectElement;
        if (!select) return;

        select.addEventListener('change', () => {
            const column = select.value;
            this.updateThematicData(column);
        });
    }

    protected updateThematicData(column: string) {
        if (!column) {
            // "None" selected — clear thematic data
            const getFnv = (_feature: Feature) => 0;
            this.map.updateGeoJsonLayerThematic('neighborhoods', this.neighs, getFnv);
        } else {
            const getFnv = (feature: Feature) => {
                const properties = feature.properties as GeoJsonProperties;
                // Navigate nested properties using dot notation
                const parts = column.split('.');
                let value: any = properties;
                for (const part of parts) {
                    value = value?.[part];
                }
                return value || 0;
            };
            this.map.updateGeoJsonLayerThematic('neighborhoods', this.neighs, getFnv);
        }
    }

    async loadAndJoin(geojson: string, csv: string) {
        await this.db.loadCsv({
            csvFileUrl: `http://localhost:5173/data/${csv}.csv`,
            outputTableName: csv,
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });
        await this.db.spatialJoin({
            tableRootName: geojson,
            tableJoinName: csv,
            spatialPredicate: 'INTERSECT',
            output: {
                type: 'MODIFY_ROOT',
            },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: [
                    {
                        tableName: csv,
                        column: 'Unique Key',
                        aggregateFn: 'count',
                    },
                ],
            },
        });
    }
}


async function main() {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdyParallel = document.querySelector('#plotBodyParallel') as HTMLElement;
    const plotBdyTable = document.querySelector('#plotBodyTable') as HTMLElement;

    if (!canvas || !plotBdyParallel || !plotBdyTable) {
        console.error('Canvas or plot body element not found');
        return;
    }

    const example = new MapParallelCoordinates();
    await example.run(canvas, plotBdyParallel, plotBdyTable);
}
main();
