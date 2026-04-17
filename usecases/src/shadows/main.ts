declare function setLoadingState(message: string, note?: string): void;
declare function hideLoading(): void;
declare function showError(message: string, note?: string): void;

import { FeatureCollection } from 'geojson';

import { AutkSpatialDb } from 'autk-db';
import { ComputeGpgpu } from 'autk-compute';
import { AutkMap, LayerType, VectorLayer, MapEvent } from 'autk-map';
import { AutkChart, ChartEvent } from 'autk-plot';

import splitRoadsQuery from './split-roads.sql?raw';
import shadowShader from './shadow.wgsl?raw';

import {
    MonthCode,
    MONTH_CONFIG,
    DEFAULT_MONTH,
    MONTH_DOY,
    isMonthCode,
    resolveBuildingFootprint,
    resolveBuildingHeight,
    mergeComputedRoads,
    clearRoadsCompute,
} from './utils';

const URL = (import.meta as any).env.BASE_URL;

/**
 * End-to-end urban shadows case study.
 *
 * This class orchestrates data loading, compute execution, map rendering,
 * picking interactions, and linked chart filtering in one runnable example.
 *
 * Data flow overview:
 * 1) load and derive data in the spatial DB,
 * 2) keep one mutable roads collection in memory,
 * 3) patch `properties.compute` in place after analytical runs,
 * 4) map display modes to different thematic accessors.
 */
export class Shadows {
    /** Main map facade used for rendering, picking and thematic updates. */
    protected map!: AutkMap;
    /** Spatial DB facade used for OSM loading and SQL/spatial transformations. */
    protected db!: AutkSpatialDb;
    /** Histogram chart instance linked to roads selection/highlighting. */
    protected histogram!: AutkChart;

    /** Logical identifier of the segmented roads layer used in this workflow. */
    protected readonly ROADS_LAYER = 'table_roads_20m';

    /** Mutable roads collection used as single source of truth for thematic values. */
    protected roads!: FeatureCollection;
    /** Buildings collection used as the picking/compute source. */
    protected buildings!: FeatureCollection;

    /** Currently selected building id from map picking, null when nothing is selected. */
    protected selectedBuildingId: number | null = null;
    /** Selected building footprint ring used as compute uniform matrix. */
    protected selectedBuildingRing: number[][] | null = null;
    /** Selected building height in meters used as compute uniform scalar. */
    protected selectedBuildingHeight: number = 0;

    /** Active month that drives baseline aggregation and analytical compute inputs. */
    protected currentMonth: MonthCode = DEFAULT_MONTH;
    /** Active roads thematic mode. */
    protected displayMode: 'heatmap' | 'compute' | 'contribution' = 'heatmap';

    /** DOM host where the histogram chart is rendered. */
    protected histogramDiv!: HTMLElement;

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Boots the complete shadows example runtime.
     *
     * @param canvas Map rendering canvas.
     * @param histogramDiv Container element where the histogram is mounted.
     */
    async run(canvas: HTMLCanvasElement, histogramDiv: HTMLElement): Promise<void> {
        this.histogramDiv = histogramDiv;

        await this.loadDb();
        await this.loadMap(canvas);

        this.updateThematicData();
        this.reloadHistogram();
        this.updateHistogramListeners();
        this.updateMapListeners();
    }

    /**
     * Computes per-road shadow metrics for one building and one month.
     *
     * Shader outputs are merged back into the in-memory roads collection under
     * `properties.compute` while preserving original feature attributes.
     *
     * @param footprint Building footprint ring used as uniform matrix input.
     * @param height Building height in meters.
     * @param month Active month code for day-of-year and baseline lookup.
     */
    async computeShadows(footprint: number[][], height: number, month: MonthCode): Promise<void> {
        const doy = MONTH_DOY[month];

        // seg, sjoin_avg are per-feature. bld_height, doy, ring are global constants for the dispatch.
        // Buffer count: seg auto matrix (1) + varrows (1) + sjoin_avg scalar (1)
        //             + uniforms: bld_height, doy (2) + ring (1) + 2 outputs = 8.
        const geojsonCompute = new ComputeGpgpu();
        const result = await geojsonCompute.run({
            collection: this.roads,
            variableMapping: {
                seg:       'geometry.coordinates',
                sjoin_avg: `sjoin.avg.${month}`,
            },
            attributeMatrices: {
                seg: { rows: 'auto', cols: 2 },
            },
            uniforms: {
                bld_height: height,
                doy,
            },
            uniformMatrices: {
                ring: { data: footprint, cols: 2 },
            },
            outputColumns: ['shadow', 'contribution'],
            wgslBody: shadowShader,
        });

        mergeComputedRoads(this.roads, result);
    }

    /**
     * Handles month dropdown changes.
     *
     * Recomputes analytical values when a building is selected; otherwise
     * resets compute attributes to zero. Then refreshes chart listeners and map
     * thematic state.
     *
     * @param month Raw month code from UI.
     */
    async changeMonth(month: string): Promise<void> {
        const normalizedMonth = isMonthCode(month)
            ? month
            : DEFAULT_MONTH;
        this.currentMonth = normalizedMonth;

        const roadsLayer = this.map.layerManager.searchByLayerId(this.ROADS_LAYER) as VectorLayer;
        roadsLayer?.clearHighlightedIds();

        // Recompute accumulated shadows for the new date if a building is selected.
        if (this.selectedBuildingRing) {
            await this.computeShadows(this.selectedBuildingRing, this.selectedBuildingHeight, this.currentMonth);
        } else {
            clearRoadsCompute(this.roads);
        }

        this.reloadHistogram();
        this.updateHistogramListeners();
        this.updateThematicData();
    }

    /**
     * Handles display mode radio changes and reapplies thematic rendering.
     *
     * @param mode Target thematic display mode.
     */
    changeDisplayMode(mode: 'heatmap' | 'compute' | 'contribution'): void {
        this.displayMode = mode;

        const roadsLayer = this.map.layerManager.searchByLayerId(this.ROADS_LAYER) as VectorLayer;
        roadsLayer?.clearHighlightedIds();

        this.updateThematicData();
    }

    // ── Database (protected) ───────────────────────────────────────────────────

    /**
     * Loads and derives all data required by this example.
     *
     * It performs OSM loading, CSV ingestion, road segmentation, and monthly
     * baseline aggregation (`sjoin.avg.<month>`), then caches roads/buildings.
     * Finally it initializes compute attributes to zeros to keep compute and
     * contribution thematic modes always defined.
     */
    protected async loadDb(): Promise<void> {
        setLoadingState('Initializing spatial database...', 'Preparing the in-browser data environment.');
        this.db = new AutkSpatialDb();
        await this.db.init();

        setLoadingState('Loading OpenStreetMap data...', 'Fetching Chicago Loop from Overpass API.');
        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'Chicago',
                areas: ['Loop', 'Near South Side'],
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

        setLoadingState('Loading shadow measurements...', 'Importing accumulated shadow data.');
        await this.db.loadCsv({
            csvFileUrl: `${URL}data/shadows_chicago.csv`,
            outputTableName: 'shadows',
            geometryColumns: {
                latColumnName: 'latitude',
                longColumnName: 'longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        setLoadingState('Splitting road segments...', 'Dividing roads into 20 m segments.');
        await this.db.rawQuery({
            query: splitRoadsQuery,
            output: {
                type: 'CREATE_TABLE',
                tableName: this.ROADS_LAYER,
                source: 'user',
                tableType: 'roads',
            },
        });

        setLoadingState('Computing shadow joins...', 'Linking shadow measurements to road segments for each season.');
        for (const { code: month } of MONTH_CONFIG) {
            await this.db.spatialQuery({
                tableRootName: this.ROADS_LAYER,
                tableJoinName: 'shadows',
                spatialPredicate: 'NEAR',
                nearDistance: 200,
                output: { type: 'MODIFY_ROOT' },
                joinType: 'LEFT',
                groupBy: {
                    selectColumns: [{
                        tableName: 'shadows',
                        column: month,
                        aggregateFn: 'avg',
                        aggregateFnResultColumnName: month,
                    }],
                },
            });
        }

        this.roads     = await this.db.getLayer(this.ROADS_LAYER);
        this.buildings = await this.db.getLayer('table_osm_buildings');

        clearRoadsCompute(this.roads);
    }

    /** Clears selected-building fields to the no-selection state. */
    protected clearSelectedBuildingState(): void {
        this.selectedBuildingId = null;
        this.selectedBuildingRing = null;
        this.selectedBuildingHeight = 0;
    }

    // ── Map (protected) ────────────────────────────────────────────────────────

    /**
     * Initializes map rendering and uploads all DB-derived layers.
     *
     * @param canvas Map rendering canvas.
     */
    protected async loadMap(canvas: HTMLCanvasElement): Promise<void> {
        setLoadingState('Initializing map...', 'Preparing the WebGPU rendering context.');
        this.map = new AutkMap(canvas);
        await this.map.init();

        setLoadingState('Rendering layers...', 'Uploading geometry to the GPU.');
        for (const layerData of this.db.getLayerTables()) {
            // Skip the original un-split roads; we use the 20 m version instead.
            if (layerData.name === 'table_osm_roads') continue;

            const layer = await this.db.getLayer(layerData.name);

            if (layerData.name === 'heatmap') {
                await this.map.loadCollection(layerData.name, { collection: layer,
                    type: 'raster',
                    property: 'avg.shadows', });
                this.map.updateRenderInfo(layerData.name, { opacity: 0.5, isColorMap: true, isSkip: true });
            }
            else {
                this.map.loadCollection(layerData.name, { collection: layer, type: layerData.type as LayerType });
            }

        }

        this.map.updateRenderInfo('table_osm_buildings', { isPick: true });

        this.map.draw();
    }

    /**
     * Wires map picking events to building selection lifecycle.
     *
     * - empty selection resets selected-building state and compute attributes
     * - picked building triggers per-building compute and thematic refresh
     */
    protected updateMapListeners(): void {
        this.map.events.on(MapEvent.PICKING, async ({ selection, layerId }) => {
            if (layerId !== 'table_osm_buildings') return;
            if (selection.length === 0) {
                this.clearSelectedBuildingState();
                clearRoadsCompute(this.roads);
                this.updateThematicData();
                return;
            }

            try {
                await this.onBuildingPick(selection[0]);
            } catch (error) {
                console.error('Shadows: failed to process picked building.', error);
            }
        });
    }

    /**
     * Handles one picked building event end-to-end.
     *
     * @param id Feature id emitted by the building picking layer.
     */
    protected async onBuildingPick(id: number): Promise<void> {
        const feature = this.buildings.features[id];
        if (!feature) return;

        this.selectedBuildingId = id;

        // Enforce single-selection: clear any previously highlighted building.
        const buildingsLayer = this.map.layerManager.searchByLayerId('table_osm_buildings') as VectorLayer;
        buildingsLayer?.setHighlightedIds([id]);

        // Buildings are now single features with GeometryCollection parts.
        // Use the largest available ring and the max part height.
        const ring = resolveBuildingFootprint(feature);
        const height = resolveBuildingHeight(feature);
        if (!ring) {
            console.warn(`Shadows: no valid polygon footprint for picked building ${id}.`);
            return;
        }

        this.selectedBuildingRing = ring;
        this.selectedBuildingHeight = height;

        await this.computeShadows(ring, height, this.currentMonth);

        if (this.displayMode === 'compute' || this.displayMode === 'contribution') {
            this.updateThematicData();
        }
    }

    /**
     * Applies roads thematic mapping according to current display mode.
     *
     * - `heatmap` uses monthly baseline values
     * - `compute` uses analytical shadow minutes
     * - `contribution` uses analytical percent contribution
     */
    protected updateThematicData(): void {
        if (this.displayMode === 'heatmap') {
            this.map.updateThematic(this.ROADS_LAYER, { collection: this.roads,
                property: `properties.sjoin.avg.${this.currentMonth}`, });
            this.map.updateRenderInfo(this.ROADS_LAYER, { isPick: true });
            this.map.updateRenderInfo(this.ROADS_LAYER, { isColorMap: true });
            this.map.draw();
            return;
        }

        // 'compute' or 'contribution' mode
        const key = this.displayMode === 'compute' ? 'shadow' : 'contribution';

        this.map.updateThematic(this.ROADS_LAYER, { collection: this.roads, property: `properties.compute.${key}` });
        this.map.updateRenderInfo(this.ROADS_LAYER, { isColorMap: true });
        this.map.draw();
    }

    // ── Histogram (protected) ──────────────────────────────────────────────────

    /**
     * Recreates the monthly histogram chart from current roads data.
     */
    protected reloadHistogram(): void {
        this.histogramDiv.innerHTML = '';

        this.histogram = new AutkChart(this.histogramDiv, {
            type: 'barchart',
            collection: this.roads,
            attributes: { axis: [`sjoin.avg.${this.currentMonth}`, '@transform'] },
            labels: { axis: ['Hours of shadow', '#Road segments'], title: 'Shadow distribution' },
            width: 600,
            height: 380,
            events: [ChartEvent.BRUSH_X],
            transform: {
                preset: 'binning-1d',
                options: { bins: 13 },
            },
        });
    }

    /**
     * Connects histogram brushing to roads-layer highlighting.
     */
    protected updateHistogramListeners(): void {
        this.histogram.events.on(ChartEvent.BRUSH_X, ({ selection: roadIds }) => {
            const layer = this.map.layerManager.searchByLayerId(this.ROADS_LAYER);
            (<VectorLayer>layer)?.setHighlightedIds(roadIds);
            this.map.draw();
        });
    }
}

// ── Entry Point ────────────────────────────────────────────────────────────

/**
 * Browser entrypoint for the shadows use case page.
 *
 * Creates and runs the example, exposes it to `window` for inline HTML event
 * handlers, and emits `shadows-ready` when async boot completes.
 */
async function main() {
    try {
        const canvas = document.querySelector('canvas');
        const histogramDiv = document.querySelector('#histogramBody') as HTMLElement;

        if (!(canvas instanceof HTMLCanvasElement) || !histogramDiv) {
            throw new Error('Canvas or histogram element not found.');
        }

        const shadows = new Shadows();
        await shadows.run(canvas, histogramDiv);

        (window as any).shadows = shadows;
        hideLoading();
        window.dispatchEvent(new CustomEvent('shadows-ready'));
    } catch (error) {
        console.error(error);
        showError('Failed to load the Shadows case study.', 'Please verify the dataset paths and reload the page.');
    }
}
main();
