
import { Feature, FeatureCollection, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, MapEvent, VectorLayer } from 'autk-map';
import { ParallelCoordinates, TableVis, PlotEvent } from 'autk-plot';

export class Urbane {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    protected table!: TableVis;
    protected parallel!: ParallelCoordinates;

    protected neighs!: FeatureCollection;
    protected activeBuildings!: FeatureCollection;

    protected currentLevel: 'neighborhoods' | 'active_buildings' = 'neighborhoods';
    protected selectedNeighIds: number[] = [];

    protected datasets: string[] = ['noise', 'parking', 'permit', 'taxi'];

    protected mapCanvas!: HTMLCanvasElement;
    protected plotDivTable!: HTMLElement;
    protected plotDivParallel!: HTMLElement;

    public async run(canvas: HTMLCanvasElement, plotDivParallel: HTMLElement, plotDivTable: HTMLElement): Promise<void> {
        this.mapCanvas = canvas;
        this.plotDivParallel = plotDivParallel;
        this.plotDivTable = plotDivTable;

        await this.loadAutkDb();
        await this.loadAutkMap();
        this.loadAutkPlot();

        this.updateMapListeners();
        this.updatePlotListeners();

        this.setupThematicDropdown();
        this.setupLevelButton();
    }

    //-- Db initialization

    protected async loadPhysicalLayers() {
        await this.db.loadOsmFromOverpassApi({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Manhattan Island'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });

        await this.db.spatialJoin({
            tableRootName: 'table_osm_buildings',
            tableJoinName: 'neighborhoods',
            spatialPredicate: 'INTERSECT',
            output: {
                type: 'MODIFY_ROOT',
            },
            joinType: 'LEFT'
        });

    }

    protected async loadAndJoinThematicData() {
        for (const dataset of this.datasets) {
            await this.db.loadCsv({
                csvFileUrl: `http://localhost:5173/data/${dataset}.csv`,
                outputTableName: dataset,
                geometryColumns: {
                    latColumnName: 'Latitude',
                    longColumnName: 'Longitude',
                    coordinateFormat: 'EPSG:3395',
                }
            });
            await this.db.spatialJoin({
                tableRootName: 'neighborhoods',
                tableJoinName: dataset,
                spatialPredicate: 'INTERSECT',
                output: {
                    type: 'MODIFY_ROOT',
                },
                joinType: 'LEFT',
                groupBy: {
                    selectColumns: [
                        {
                            tableName: dataset,
                            column: 'Unique Key',
                            aggregateFn: 'count',
                        },
                    ],
                },
            });
        }
    }

    protected async loadAutkDb() {
        this.db = new SpatialDb();
        await this.db.init();

        await this.loadPhysicalLayers();
        await this.loadAndJoinThematicData();
    }

    //-- Map initialization

    protected async loadAutkMap() {
        this.map = new AutkMap(this.mapCanvas);
        await this.map.init();

        for (const layerData of this.db.getLayerTables()) {
            if (layerData.name === 'table_osm_buildings') continue;

            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
        }

        this.neighs = await this.db.getLayer('neighborhoods');
        this.map.updateRenderInfoProperty('neighborhoods', 'opacity', 0.75);
        this.map.updateRenderInfoProperty('neighborhoods', 'isPick', true);

        this.map.draw();
    }

    protected updateThematicData(column: string) {
        const getFnv: (feature: Feature) => number = (feature: Feature) => {
                const properties = feature.properties as GeoJsonProperties;
                const parts = column.split('.');

                let value: any = properties;
                for (const part of parts) {
                    value = value?.[part];
                }
                return value || 0;
            };

        if (this.currentLevel === 'neighborhoods') {
            this.map.updateGeoJsonLayerThematic('neighborhoods', this.neighs, getFnv);
        }
        if(this.currentLevel === 'active_buildings') {
            this.map.updateGeoJsonLayerThematic('active_buildings', this.activeBuildings, getFnv, true);
        }
    }

    //-- Plot initialization

    protected loadAutkPlot() {
        this.plotDivParallel.innerHTML = '';
        this.plotDivTable.innerHTML = '';

        const axisLabels = this.datasets.map(d => `sjoin.count.${d}`);
        const titleCol = (this.currentLevel === 'neighborhoods') ? 'ntaname' : 'addr:street';
        const plotData = (this.currentLevel === 'neighborhoods') ? this.neighs : this.activeBuildings;

        this.parallel = new ParallelCoordinates({
            div: this.plotDivParallel,
            data: plotData,
            labels: { 
                axis: axisLabels, 
                title: `${this.currentLevel} Characteristics` 
            },
            width: 790,
            events: [PlotEvent.BRUSH_Y]
        });

        this.table = new TableVis({
            div: this.plotDivTable,
            data: plotData,
            labels: {
                axis: [titleCol, ...axisLabels],
                title: `${this.currentLevel} Characteristics`
            },
            width: 790,
            events: [PlotEvent.CLICK]
        });
    }

    //-- Event listeners

    protected async updateMapListeners() {
        this.map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[]) => {
            if (this.currentLevel === 'neighborhoods') 
                this.selectedNeighIds = selection;

            this.table.setHighlightedIds(selection);
            this.parallel.setHighlightedIds(selection);
        });
    }

    protected updatePlotListeners() {
        this.table.plotEvents.addEventListener(PlotEvent.CLICK, (selection: number[]) => {
            if (this.currentLevel === 'neighborhoods') 
                this.selectedNeighIds = selection;

            const layer = <VectorLayer>this.map.layerManager.searchByLayerId(this.currentLevel);
            layer!.setHighlightedIds(selection);

            this.parallel.setHighlightedIds(selection);
        });

        this.parallel.plotEvents.addEventListener(PlotEvent.BRUSH_Y, (selection: number[]) => {
            if (this.currentLevel === 'neighborhoods') 
                this.selectedNeighIds = selection;

            const layer = <VectorLayer>this.map.layerManager.searchByLayerId(this.currentLevel);
            layer!.setHighlightedIds(selection);

            this.table.setHighlightedIds(selection);
        });
    }

    //-- Drill-down

    protected async buildBuildingsSelection() {
        const source = this.selectedNeighIds.length > 0
            ? this.selectedNeighIds.map(id => this.neighs.features[id])
            : this.neighs.features;

        const inList = [...new Set(source.map(f => f?.properties?.ntaname))]
            .map(n => `'${n.replace(/'/g, "''")}'`)
            .join(', ');

        await this.db.rawQuery({
            query: `
                WITH grouped AS (
                    SELECT building_id,
                           ST_Union_Agg(geometry) AS geometry,
                           ANY_VALUE(properties)  AS properties
                    FROM   table_osm_buildings
                    WHERE  properties->'sjoin'->>'ntaname' IN (${inList})
                    GROUP  BY building_id
                )
                SELECT geometry, properties, (ROW_NUMBER() OVER () - 1) AS building_id
                FROM   grouped
            `,
            output: { type: 'CREATE_TABLE', tableName: 'active_buildings', source: 'osm', tableType: LayerType.AUTK_OSM_BUILDINGS },
        });

        for (const dataset of this.datasets) {
            await this.db.spatialJoin({
                tableRootName: 'active_buildings',
                tableJoinName: dataset,
                spatialPredicate: 'NEAR',
                nearDistance: 500, // meters
                output: { type: 'MODIFY_ROOT' },
                joinType: 'LEFT',
                groupBy: {
                    selectColumns: [{
                        tableName: dataset,
                        column: 'Unique Key',
                        aggregateFn: 'count',
                    }],
                },
            });
        }
        this.activeBuildings = await this.db.getLayer('active_buildings');
    }

    protected async drillDown() {
        if (this.currentLevel === 'neighborhoods' && this.selectedNeighIds.length === 0) {
            alert('Please select at least one neighborhood to drill down into its buildings.');
            return;
        }

        const btn = document.querySelector('#levelBtn') as HTMLButtonElement;
        btn.disabled = true;

        if (this.currentLevel === 'neighborhoods') {
            this.currentLevel = 'active_buildings';

            await this.buildBuildingsSelection();
            this.map.loadGeoJsonLayer('active_buildings', this.activeBuildings, LayerType.AUTK_OSM_BUILDINGS);

            this.map.updateRenderInfoProperty('neighborhoods', 'isSkip', true);
            this.map.updateRenderInfoProperty('neighborhoods', 'isPick', false);
            this.map.updateRenderInfoProperty('active_buildings', 'isSkip', false);
            this.map.updateRenderInfoProperty('active_buildings', 'isPick', true);
            this.map.draw();

            this.loadAutkPlot();
            this.updatePlotListeners();

            btn.innerHTML = '&#x25B2;';
            btn.title = 'Back to neighborhoods';
        } 
        else {
            this.currentLevel = 'neighborhoods';
            this.selectedNeighIds = [];

            await this.db.removeLayer('active_buildings');
            this.map.layerManager.removeLayerById('active_buildings');

            this.map.updateRenderInfoProperty('neighborhoods', 'isSkip', false);
            this.map.updateRenderInfoProperty('neighborhoods', 'isPick', true);
            this.map.updateRenderInfoProperty('active_buildings', 'isSkip', true);
            this.map.updateRenderInfoProperty('active_buildings', 'isPick', false);
            this.map.draw();

            this.loadAutkPlot();
            this.updatePlotListeners();

            btn.innerHTML = '&#x25BC;';
            btn.title = 'Drill into buildings';
        }

        btn.disabled = false;
    }

    protected setupLevelButton() {
        const btn = document.querySelector('#levelBtn') as HTMLButtonElement;
        if (!btn) return;
        btn.addEventListener('click', () => this.drillDown());
    }

    protected setupThematicDropdown() {
        const select = document.querySelector('#thematicSelect') as HTMLSelectElement;
        if (!select) return;

        select.addEventListener('change', () => {
            const column = select.value;
            this.updateThematicData(column);
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

    const example = new Urbane();
    await example.run(canvas, plotBdyParallel, plotBdyTable);
}
main();
