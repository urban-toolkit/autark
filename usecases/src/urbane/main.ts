
import { Feature, FeatureCollection, GeoJsonProperties } from 'geojson';

import { AutkSpatialDb } from 'autk-db';
import { GeojsonCompute, RenderCompute } from 'autk-compute';
import { ParallelCoordinates, TableVis, PlotEvent } from 'autk-plot';
import { AutkMap, LayerType, MapEvent, VectorLayer } from 'autk-map';
import { NormalizationMode } from 'autk-core';

declare function setLoadingState(message: string, note?: string): void;
declare function hideLoading(): void;
declare function showError(message: string, note?: string): void;

export class Urbane {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;
    protected table!: TableVis;
    protected parallel!: ParallelCoordinates;

    protected neighs!: FeatureCollection;
    protected activeBuildings!: FeatureCollection;
    protected roadsWithSky?: FeatureCollection;

    protected distance: number = 1000;
    protected currentLevel: 'neighborhoods' | 'active_buildings' = 'neighborhoods';
    protected selectedNeighIds: number[] = [];

    protected mapCanvas!: HTMLCanvasElement;
    protected plotDivTable!: HTMLElement;
    protected plotDivParallel!: HTMLElement;

    public datasets: string[] = ['arrest', 'new_building', 'noise', 'restaurants', 'school', 'subway', 'tree'];
    public weights: number[] = [0.3, 0.2, 0.0, 0.5, 0.0, 0.0, 0.0];
    public skyExposureWeight: number = 0.0;

    public async run(canvas: HTMLCanvasElement, plotDivParallel: HTMLElement, plotDivTable: HTMLElement): Promise<void> {
        this.mapCanvas = canvas;
        this.plotDivParallel = plotDivParallel;
        this.plotDivTable = plotDivTable;

        await this.loadDb();
        await this.loadMap();
        this.reloadPlot();

        this.updateMapListeners();
        this.updatePlotListeners();
    }

    // ── Database ──────────────────────────────────────────────────────────────

    protected async loadDb(): Promise<void> {
        setLoadingState('Initializing spatial database...', 'Preparing the in-browser data environment.');
        this.db = new AutkSpatialDb();
        await this.db.init();

        setLoadingState('Loading OpenStreetMap data...', 'Fetching Manhattan from Overpass API.');
        await this.db.loadOsm({
            queryArea: { geocodeArea: 'New York', areas: ['Manhattan Island'] },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        setLoadingState('Loading neighborhood dataset...', 'Importing Manhattan neighborhood boundaries.');
        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395',
        });

        await this.db.spatialQuery({
            tableRootName: 'table_osm_buildings',
            tableJoinName: 'neighborhoods',
            spatialPredicate: 'INTERSECT',
            output: { type: 'MODIFY_ROOT' },
            joinType: 'LEFT',
        });

        setLoadingState('Loading urban datasets...', 'Importing arrests, schools, restaurants, and other datasets.');
        for (const dataset of this.datasets) {
            await this.db.loadCsv({
                csvFileUrl: `http://localhost:5173/data/${dataset}_manhattan_clean.csv`,
                outputTableName: dataset,
                geometryColumns: {
                    latColumnName: 'latitude',
                    longColumnName: 'longitude',
                    coordinateFormat: 'EPSG:3395',
                },
            });
            await this.db.spatialQuery({
                tableRootName: 'neighborhoods',
                tableJoinName: dataset,
                spatialPredicate: 'INTERSECT',
                output: { type: 'MODIFY_ROOT' },
                joinType: 'LEFT',
                groupBy: {
                    selectColumns: [{
                        tableName: dataset,
                        column: 'key',
                        aggregateFn: 'count',
                        normalize: true,
                    }],
                },
            });
        }

        setLoadingState('Computing sky view factor...', 'Running render-based GPU analysis for road segments.');
        const buildingsGeoJson = await this.db.getLayer('table_osm_buildings');
        const roadsGeoJson     = await this.db.getLayer('table_osm_roads');
        const rc = new RenderCompute();
        this.roadsWithSky = await rc.renderIntoMetrics({
            layers:     [{ geojson: buildingsGeoJson, color: { r: 0.8, g: 0.3, b: 0.1, alpha: 1.0 } }],
            viewpoints: roadsGeoJson,
            tileSize:   64,
        });

        setLoadingState('Joining sky exposure to neighborhoods...', 'Computing average sky exposure per neighborhood.');
        await this.db.updateTable({ tableName: 'table_osm_roads', data: this.roadsWithSky, strategy: 'replace' });

        await this.db.spatialQuery({
            tableRootName: 'neighborhoods',
            tableJoinName: 'table_osm_roads',
            spatialPredicate: 'INTERSECT',
            output: { type: 'MODIFY_ROOT' },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: [{
                    tableName: 'table_osm_roads',
                    column: 'compute.skyViewFactor',
                    aggregateFn: 'avg',
                    aggregateFnResultColumnName: 'skyExposure',
                    normalize: true,
                }],
            },
        });

        setLoadingState('Computing livability score...', 'Applying weighted GPU function over neighborhood data.');
        this.neighs = await this.computeScore(await this.db.getLayer('neighborhoods'));
    }

    // ── Compute ───────────────────────────────────────────────────────────────

    protected async computeScore(geojson: FeatureCollection): Promise<FeatureCollection> {
        // Pack all normalised inputs into one array per feature so the GPU uses
        // 3 storage buffers (vals + weights + output) instead of one per attribute,
        // staying well within the WebGPU per-stage limit of 8.
        const invertedDatasets = new Set(['arrest', 'noise']);
        const N = this.datasets.length + 1; // 7 datasets + sky exposure = 8

        for (const f of geojson.features) {
            const p = f.properties as any;
            const vals = this.datasets.map(d => {
                const v: number = p?.sjoin?.count?.[`${d}_norm`] ?? 0;
                return invertedDatasets.has(d) ? 1 - v : v;
            });
            vals.push(p?.sjoin?.avg?.skyExposure_norm ?? 0); // index 7; 0 for buildings
            p.scoreInputs = vals;
        }

        return new GeojsonCompute().analytical({
            collection: geojson,
            variableMapping: { vals: 'scoreInputs' },
            attributeArrays: { vals: N },
            uniformArrays: { weights: [...this.weights, this.skyExposureWeight] },
            resultField: 'score',
            wgslBody: `
                var s = 0.0;
                for (var i = 0u; i < vals_length; i++) {
                    s += vals[i] * weights[i];
                }
                return s;
            `,
        });
    }

    // ── Map ───────────────────────────────────────────────────────────────────

    protected async loadMap(): Promise<void> {
        setLoadingState('Initializing map...', 'Preparing the WebGPU rendering context.');
        this.map = new AutkMap(this.mapCanvas);
        await this.map.init();

        setLoadingState('Rendering layers...', 'Uploading geometry to the GPU.');
        for (const layerData of this.db.getLayerTables()) {
            const geojson = layerData.name === 'neighborhoods'
                ? this.neighs
                : await this.db.getLayer(layerData.name);
            this.map.loadCollection({ id: layerData.name, collection: geojson, type: layerData.type as LayerType });
        }

        this.map.updateRenderInfo('table_osm_buildings', { isSkip: true });
        this.map.updateRenderInfo('neighborhoods', { opacity: 0.75 });
        this.map.updateRenderInfo('neighborhoods', { isPick: true });
        this.map.draw();

        if (this.roadsWithSky) {
            this.map.updateThematic({
                id: 'table_osm_roads',
                collection: this.roadsWithSky,
                getFnv: (item: unknown) => {
                    const f = item as Feature;
                    return f.properties?.compute?.skyViewFactor ?? 0;
                },
                normalization: { mode: NormalizationMode.PERCENTILE, lowerPercentile: 0.15, upperPercentile: 0.85 },
            });
            this.map.updateRenderInfo('table_osm_roads', { isColorMap: true });
        }
    }

    protected updateThematicData(column: string): void {
        const layerId = this.currentLevel;
        const geojson = this.currentLevel === 'neighborhoods' ? this.neighs : this.activeBuildings;

        if (column === 'none') {
            this.map.updateRenderInfo(layerId, { isColorMap: false });
            this.map.draw();
            return;
        }

        const getFnv = (item: unknown) => {
            const feature = item as Feature;
            const parts = column.split('.');
            let value: any = feature.properties as GeoJsonProperties;
            for (const part of parts) value = value?.[part];
            return value || 0;
        };

        this.map.updateThematic({ id: layerId, collection: geojson, getFnv });
        this.map.updateRenderInfo(layerId, { isColorMap: true });
    }

    // ── Plot ──────────────────────────────────────────────────────────────────

    protected reloadPlot(): void {
        this.plotDivParallel.innerHTML = '';
        this.plotDivTable.innerHTML = '';

        const attributes = [
            ...this.datasets.map(d => `sjoin.count.${d}`),
            'sjoin.avg.skyExposure',
            'compute.score',
        ];
        const axisLabels = [
            ...this.datasets,
            'sky exposure',
            'score',
        ];
        const plotData = this.currentLevel === 'neighborhoods' ? this.neighs : this.activeBuildings;
        const titleCol = this.currentLevel === 'neighborhoods' ? 'ntaname' : 'addr:street';
        const title = `${this.currentLevel} characteristics`;

        this.parallel = new ParallelCoordinates({
            div: this.plotDivParallel,
            collection: plotData,
            attributes,
            labels: { axis: axisLabels, title },
            width: 790,
            events: [PlotEvent.BRUSH_Y],
        });

        this.table = new TableVis({
            div: this.plotDivTable,
            collection: plotData,
            attributes: [titleCol, ...attributes],
            labels: { axis: ['Id', ...axisLabels], title },
            width: 790,
            events: [PlotEvent.CLICK],
        });
    }

    // ── Event Listeners ───────────────────────────────────────────────────────

    protected updateMapListeners(): void {
        this.map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
            if (layerId !== this.currentLevel) return;

            if (this.currentLevel === 'neighborhoods') {
                this.selectedNeighIds = selection;
            }

            this.table?.setHighlightedIds(selection);
            this.parallel?.setHighlightedIds(selection);
        });
    }

    protected updatePlotListeners(): void {
        this.table.events.addListener(PlotEvent.CLICK, ({ selection }) => {
            if (this.currentLevel === 'neighborhoods')
                this.selectedNeighIds = selection;

            (<VectorLayer>this.map.layerManager.searchByLayerId(this.currentLevel))!.setHighlightedIds(selection);
            this.parallel.setHighlightedIds(selection);
        });

        this.parallel.events.addListener(PlotEvent.BRUSH_Y, ({ selection }) => {
            if (this.currentLevel === 'neighborhoods')
                this.selectedNeighIds = selection;

            (<VectorLayer>this.map.layerManager.searchByLayerId(this.currentLevel))!.setHighlightedIds(selection);
            this.table.setHighlightedIds(selection);
        });
    }

    // ── Weights ───────────────────────────────────────────────────────────────

    public async updateWeights(newWeights: number[]): Promise<void> {
        this.weights = newWeights.slice(0, this.datasets.length);
        this.skyExposureWeight = newWeights[this.datasets.length] ?? 0;

        const rawLayer = await this.db.getLayer(this.currentLevel);
        if (this.currentLevel === 'neighborhoods')
            this.neighs = await this.computeScore(rawLayer);
        else
            this.activeBuildings = await this.computeScore(rawLayer);

        this.reloadPlot();
        this.updatePlotListeners();

        const thematicSelect = document.querySelector('#thematicSelect') as HTMLSelectElement;
        this.updateThematicData(thematicSelect.value);
    }

    // ── Drill-down ────────────────────────────────────────────────────────────

    protected async updateBuildingsSelection(): Promise<void> {
        const source = this.selectedNeighIds.length > 0
            ? this.selectedNeighIds.map(id => this.neighs.features[id])
            : this.neighs.features;

        const inList = [...new Set(source.map(f => f?.properties?.ntaname))]
            .map(n => `'${n.replace(/'/g, "''")}'`)
            .join(', ');

        await this.db.rawQuery({
            query: `
                SELECT geometry, properties, building_id
                FROM   table_osm_buildings
                WHERE  properties->'sjoin'->>'ntaname' IN (${inList})
            `,
            output: { type: 'CREATE_TABLE', tableName: 'active_buildings', source: 'osm', tableType: 'buildings' },
        });

        for (const dataset of this.datasets) {
            await this.db.spatialQuery({
                tableRootName: 'active_buildings',
                tableJoinName: dataset,
                spatialPredicate: 'NEAR',
                nearDistance: this.distance,
                nearUseCentroid: true,
                output: { type: 'MODIFY_ROOT' },
                joinType: 'LEFT',
                groupBy: {
                    selectColumns: [{
                        tableName: dataset,
                        column: 'key',
                        aggregateFn: 'count',
                        normalize: true,
                    }],
                },
            });
        }

        await this.db.spatialQuery({
            tableRootName: 'active_buildings',
            tableJoinName: 'table_osm_roads',
            spatialPredicate: 'NEAR',
            nearDistance: 300,
            nearUseCentroid: true,
            output: { type: 'MODIFY_ROOT' },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: [{
                    tableName: 'table_osm_roads',
                    column: 'compute.skyViewFactor',
                    aggregateFn: 'avg',
                    aggregateFnResultColumnName: 'skyExposure',
                    normalize: true,
                }],
            },
        });

        this.activeBuildings = await this.computeScore(await this.db.getLayer('active_buildings'));
    }

    public async drillDown(): Promise<void> {
        if (this.currentLevel === 'neighborhoods' && this.selectedNeighIds.length === 0) {
            alert('Please select at least one neighborhood to drill down into its buildings.');
            return;
        }

        const btn = document.querySelector('#levelBtn') as HTMLButtonElement;
        const thematicSelect = document.querySelector('#thematicSelect') as HTMLSelectElement;
        const iconDown = document.querySelector('#levelBtnDown') as HTMLElement;
        const iconUp = document.querySelector('#levelBtnUp') as HTMLElement;

        btn.disabled = true;

        if (this.currentLevel === 'neighborhoods') {
            this.currentLevel = 'active_buildings';
            await this.updateBuildingsSelection();

            this.map.loadCollection({ id: 'active_buildings', collection: this.activeBuildings, type: 'buildings' });
            this.map.updateRenderInfo('neighborhoods', { isSkip: true });
            this.map.updateRenderInfo('neighborhoods', { isPick: false });
            this.map.updateRenderInfo('active_buildings', { isSkip: false });
            this.map.updateRenderInfo('active_buildings', { isPick: true });

            iconDown.style.display = 'none';
            iconUp.style.display = '';
            btn.title = 'Back to neighborhoods';
        } else {
            this.currentLevel = 'neighborhoods';
            this.selectedNeighIds = [];

            await this.db.removeLayer('active_buildings');
            this.map.layerManager.removeLayerById('active_buildings');
            this.map.updateRenderInfo('neighborhoods', { isSkip: false });
            this.map.updateRenderInfo('neighborhoods', { isPick: true });

            iconDown.style.display = '';
            iconUp.style.display = 'none';
            btn.title = 'Drill into buildings';
        }

        this.map.draw();
        this.reloadPlot();
        this.updatePlotListeners();
        this.updateThematicData(thematicSelect.value);

        btn.disabled = false;
    }
}

async function main() {
    try {
        const canvas = document.querySelector('canvas');
        const plotDivParallel = document.querySelector('#plotBodyParallel') as HTMLElement;
        const plotDivTable = document.querySelector('#plotBodyTable') as HTMLElement;

        if (!(canvas instanceof HTMLCanvasElement) || !plotDivParallel || !plotDivTable) {
            throw new Error('Canvas or plot body element not found.');
        }

        const urbane = new Urbane();
        await urbane.run(canvas, plotDivParallel, plotDivTable);

        (window as any).urbane = urbane;
        hideLoading();
        window.dispatchEvent(new CustomEvent('urbane-ready'));
    } catch (error) {
        console.error(error);
        showError('Failed to load the Urbane case study.', 'Please verify the dataset paths and reload the page.');
    }
}
main();
