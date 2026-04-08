
import { FeatureCollection } from 'geojson';

import { AutkSpatialDb } from 'autk-db';
import { GeojsonCompute, RenderCompute } from 'autk-compute';
import { AutkChart, ChartEvent } from 'autk-plot';
import { AutkMap, LayerType, MapEvent, VectorLayer } from 'autk-map';
import { ColorMapDomainStrategy } from 'autk-core';

const URL = (import.meta as any).env.BASE_URL;

declare function setLoadingState(message: string, note?: string): void;

/**
 * Urbane use case — interactive livability explorer for Manhattan.
 *
 * Orchestrates the spatial database, GPU map renderer, and linked plots.
 * Supports two exploration levels: neighborhood polygons and individual
 * buildings within a selected neighborhood set.
 */
export class Urbane {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;
    protected table!: AutkChart;
    protected parallel!: AutkChart;

    protected neighs!: FeatureCollection;
    protected activeBuildings!: FeatureCollection;
    protected roadsWithSky?: FeatureCollection;

    protected distance: number = 300;
    protected _currentLevel: 'neighborhoods' | 'active_buildings' = 'neighborhoods';
    protected selectedNeighIds: number[] = [];

    /** Currently active exploration level. */
    get currentLevel(): 'neighborhoods' | 'active_buildings' {
        return this._currentLevel;
    }

    protected mapCanvas!: HTMLCanvasElement;
    protected plotDivTable!: HTMLElement;
    protected plotDivParallel!: HTMLElement;

    public datasets: string[] = ['arrest', 'new_building', 'noise', 'restaurants', 'school', 'subway', 'tree'];
    public weights: number[] = [0.3, 0.2, 0.0, 0.5, 0.0, 0.0, 0.0];
    public skyExposureWeight: number = 0.0;

    /**
     * Entry point. Initialises the database, map, and plots, then wires up
     * cross-component event listeners.
     *
     * @param canvas WebGPU canvas element.
     * @param plotDivParallel Container for the parallel-coordinates plot.
     * @param plotDivTable Container for the data table.
     */
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

    /**
     * Loads and prepares all data sources in the spatial database:
     * OSM base layers, neighborhood boundaries, urban datasets, sky-view
     * factor via GPU render, and the initial livability score.
     */
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
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
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
                csvFileUrl: `${URL}data/${dataset}_manhattan_clean.csv`,
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
        const roadsGeoJson = await this.db.getLayer('table_osm_roads');
        const rc = new RenderCompute();

        this.roadsWithSky = await rc.renderIntoMetrics({
            layers: [{ geojson: buildingsGeoJson, color: { r: 0.8, g: 0.3, b: 0.1, alpha: 1.0 } }],
            viewpoints: roadsGeoJson,
            tileSize: 64,
        });
        await this.db.updateTable({ tableName: 'table_osm_roads', data: this.roadsWithSky, strategy: 'replace' });

        setLoadingState('Joining sky exposure to neighborhoods...', 'Computing average sky exposure per neighborhood.');
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

        setLoadingState('Computing score...', 'Applying weighted GPU function over neighborhood data.');
        this.neighs = await this.computeScore(await this.db.getLayer('neighborhoods'));
    }

    /**
     * Computes a weighted livability score for each feature using a GPU
     * analytical shader. Inputs are packed into a single `scoreInputs` array
     * per feature (7 dataset counts + sky exposure) to stay within WebGPU
     * buffer limits.
     *
     * @param geojson Source feature collection to annotate with `compute.score`.
     */
    protected async computeScore(geojson: FeatureCollection): Promise<FeatureCollection> {
        const invertedDatasets = new Set(['arrest', 'noise']);
        const N = this.datasets.length + 1;

        for (const f of geojson.features) {
            const p = f.properties as any;
            const vals = this.datasets.map(d => {
                const v: number = p?.sjoin?.count?.[`${d}_norm`] ?? 0;
                return invertedDatasets.has(d) ? 1 - v : v;
            });
            vals.push(p?.sjoin?.avg?.skyExposure_norm ?? 0);
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

    /**
     * Initialises the WebGPU map, loads all DB layers, and applies the
     * initial sky-exposure thematic on the roads layer.
     */
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
        this.map.updateRenderInfo('neighborhoods', { opacity: 0.75, isPick: true });

        if (this.roadsWithSky) {
            this.map.updateColorMap({
                id: 'table_osm_roads',
                colorMap: {
                    domainSpec: { type: ColorMapDomainStrategy.PERCENTILE, params: [15, 85] },
                },
            });

            this.map.updateThematic({
                id: 'table_osm_roads',
                collection: this.roadsWithSky,
                property: 'properties.compute.skyViewFactor',
            });
            this.map.updateRenderInfo('table_osm_roads', { isColorMap: true });
        }

        this.map.draw();
    }

    /**
     * Applies a thematic colour mapping for `column` on the active level layer.
     * Sky-exposure columns use percentile normalisation; all others use min-max.
     *
     * @param column Dot-path property name, or `'none'` to disable the colour map.
     */
    public updateThematicData(column: string): void {
        const layerId = this.currentLevel;
        const geojson = this.currentLevel === 'neighborhoods' ? this.neighs : this.activeBuildings;

        if (column === 'none') {
            this.map.updateRenderInfo(layerId, { isColorMap: false });
            this.map.draw();
            return;
        }

        this.map.updateColorMap({
            id: layerId,
            colorMap: {
                domainSpec: column.includes('skyExposure')
                    ? { type: ColorMapDomainStrategy.PERCENTILE, params: [15, 85] }
                    : { type: ColorMapDomainStrategy.MIN_MAX },
            },
        });

        this.map.updateThematic({ id: layerId, collection: geojson, property: `properties.${column}` });
        this.map.updateRenderInfo(layerId, { isColorMap: true });
        this.map.draw();
    }

    /**
     * (Re)builds the parallel-coordinates and table plots for the active level.
     */
    protected reloadPlot(): void {
        this.plotDivParallel.innerHTML = '';
        this.plotDivTable.innerHTML = '';

        const attributes = [
            ...this.datasets.map(d => `sjoin.count.${d}`),
            'sjoin.avg.skyExposure',
            'compute.score',
        ];
        const axisLabels = [...this.datasets, 'sky exposure', 'score'];
        const plotData = this._currentLevel === 'neighborhoods' ? this.neighs : this.activeBuildings;
        const titleCol = this._currentLevel === 'neighborhoods' ? 'ntaname' : 'addr:street';
        const title = `${this._currentLevel} characteristics`;

        this.parallel = new AutkChart(this.plotDivParallel, {
            type: 'parallel-coordinates',
            collection: plotData,
            attributes: { axis: attributes },
            labels: { axis: axisLabels, title },
            width: 790,
            events: [ChartEvent.BRUSH_Y],
        });

        this.table = new AutkChart(this.plotDivTable, {
            type: 'table',
            collection: plotData,
            attributes: { axis: [titleCol, ...attributes] },
            labels: { axis: ['Id', ...axisLabels], title },
            width: 790,
            events: [ChartEvent.CLICK],
        });
    }

    /**
     * Registers the map picking event to sync selections across plots.
     */
    protected updateMapListeners(): void {
        this.map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
            if (layerId !== this._currentLevel) return;

            if (this._currentLevel === 'neighborhoods') {
                this.selectedNeighIds = selection;
            }

            this.table?.setSelection(selection);
            this.parallel?.setSelection(selection);
        });
    }

    /**
     * Registers plot interaction events to sync selections across the map
     * and the other plot.
     */
    protected updatePlotListeners(): void {
        this.table.events.on(ChartEvent.CLICK, ({ selection }) => {
            if (this._currentLevel === 'neighborhoods')
                this.selectedNeighIds = selection;

            (<VectorLayer>this.map.layerManager.searchByLayerId(this._currentLevel))!.setHighlightedIds(selection);
            this.parallel.setSelection(selection);
        });

        this.parallel.events.on(ChartEvent.BRUSH_Y, ({ selection }) => {
            if (this._currentLevel === 'neighborhoods')
                this.selectedNeighIds = selection;

            (<VectorLayer>this.map.layerManager.searchByLayerId(this._currentLevel))!.setHighlightedIds(selection);
            this.table.setSelection(selection);
        });
    }

    /**
     * Updates scoring weights and refreshes the plots and active thematic.
     *
     * @param newWeights Array of dataset weights followed by the sky-exposure weight.
     * @param thematicColumn Currently selected thematic column.
     */
    public async updateWeights(newWeights: number[], thematicColumn: string): Promise<void> {
        this.weights = newWeights.slice(0, this.datasets.length);
        this.skyExposureWeight = newWeights[this.datasets.length] ?? 0;

        const rawLayer = await this.db.getLayer(this._currentLevel);
        if (this._currentLevel === 'neighborhoods')
            this.neighs = await this.computeScore(rawLayer);
        else
            this.activeBuildings = await this.computeScore(rawLayer);

        this.reloadPlot();
        this.updatePlotListeners();
        this.updateThematicData(thematicColumn);
    }

    /**
     * Queries buildings within the selected neighborhoods and joins urban
     * datasets and sky-exposure values to them.
     */
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

    /**
     * Toggles between neighborhood and building exploration levels.
     * Drilling down loads buildings for the selected neighborhoods;
     * drilling up restores the neighborhood view.
     *
     * @param thematicColumn Currently selected thematic column.
     */
    public async drillDown(thematicColumn: string): Promise<void> {
        if (this._currentLevel === 'neighborhoods' && this.selectedNeighIds.length === 0) {
            alert('Please select at least one neighborhood to drill down into its buildings.');
            return;
        }

        if (this._currentLevel === 'neighborhoods') {
            this._currentLevel = 'active_buildings';
            await this.updateBuildingsSelection();

            this.map.loadCollection({ id: 'active_buildings', collection: this.activeBuildings, type: 'buildings' });
            this.map.updateRenderInfo('neighborhoods', { isSkip: true, isPick: false });
            this.map.updateRenderInfo('active_buildings', { isSkip: false, isPick: true });
        } else {
            this._currentLevel = 'neighborhoods';
            this.selectedNeighIds = [];

            await this.db.removeLayer('active_buildings');
            this.map.layerManager.removeLayerById('active_buildings');
            this.map.updateRenderInfo('neighborhoods', { isSkip: false, isPick: true });
        }

        this.map.draw();
        this.reloadPlot();
        this.updatePlotListeners();
        this.updateThematicData(thematicColumn);
    }
}
