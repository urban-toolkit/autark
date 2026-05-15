import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { loadDb } from './duckdb';

import {
    BoundingBox,
    CollectionLayerTable,
    CsvTable,
    GeotiffTable,
    GeojsonTable,
    GridTable,
    isCollectionLayerTable,
    isGeotiffTable,
    isOsmTable,
    JsonTable,
    OsmLayerTable,
    Table,
} from './interfaces';

import {
    DEFAULT_WORKSPACE_NAME,
    DEFAULT_INPUT_COORDINATE_FORMAT,
    DEFAULT_WORKSPACE_COORDINATE_FORMAT
} from './consts';

import { toPlain } from './utils';

import { DropTableUseCase } from './use-cases/drop-table';
import { GetBoundingBoxFromLayerUseCase } from './use-cases/get-bounding-box-from-layer';
import { GetBoundingBoxFromOsmUseCase } from './internal/get-bounding-box-from-osm/get-bounding-box-from-osm-use-case';
import { TransformBoundingBoxCoordinatesUseCase } from './internal/transform-bounding-box-coordinates/transform-bounding-box-coordinates-use-case';

import { AssignBuildingIdsUseCase } from './internal/assign-building-ids/assign-building-ids-use-case';
import { BuildHeatmapParams, BuildHeatmapUseCase } from './use-cases/build-heatmap';
import { GetLayerGeojsonUseCase } from './use-cases/get-layer-geojson';
import { GetTableDataParams, GetTableDataOutput, GetTableDataUseCase } from './use-cases/get-table-data';
import { LoadCsvParams, LoadCsvUseCase } from './use-cases/load-csv';
import { LoadCustomLayerParams, LoadCustomLayerUseCase } from './use-cases/load-custom-layer';
import { LoadGeoTiffParams, LoadGeoTiffUseCase } from './use-cases/load-geotiff';
import { LoadGridLayerParams, LoadGridLayerUseCase } from './use-cases/load-grid-layer';
import { LoadJsonParams, LoadJsonUseCase } from './use-cases/load-json';
import { LoadLayerParams, LoadLayerUseCase } from './use-cases/load-layer';
import { LoadOsmFromOverpassApiUseCase, LoadOsmParams, OsmLoadTimings } from './use-cases/load-osm-from-overpass-api';
import { LoadOsmFromPbfUseCase } from './use-cases/load-osm-from-pbf';
import { OsmProcessingPipeline } from './internal/osm-processing-pipeline/osm-processing-pipeline';
import { PolygonizeSurfaceLayerUseCase } from './internal/polygonize-surface-layer/polygonize-surface-layer-use-case';
import { RawQueryParams, RawQueryUseCase, RawQueryOutput } from './use-cases/raw-query';
import { SpatialJoinUseCase, SpatialQueryParams } from './use-cases/spatial-join';
import { UpdateTableParams, UpdateTableUseCase } from './use-cases/update-table';

interface WorkspaceData {
    tables: Array<Table>;
    coordinateFormat: string;
    workspaceBoundingBox?: BoundingBox;
    osmBoundingBox?: BoundingBox;
}

/**
 * DuckDB-backed spatial database for loading, querying, and managing urban datasets.
 *
 * Supports multiple isolated workspaces, each with its own schema and tables.
 *
 * @example
 * const db = new AutkDb();
 * await db.init();
 * await db.loadOsm({
 *   outputTableName: 'manhattan',
 *   queryArea: { geocodeArea: 'New York', areas: ['Manhattan Island'] },
 * });
 */
export class AutkDb {
    private db?: AsyncDuckDB;
    private conn?: AsyncDuckDBConnection;
    private currentWorkspace: string = DEFAULT_WORKSPACE_NAME;
    private workspaces: Map<string, WorkspaceData> = new Map();
    private osmProcessingPipeline?: OsmProcessingPipeline;
    private loadOsmFromOverpassApiUseCase?: LoadOsmFromOverpassApiUseCase;
    private loadOsmFromPbfUseCase?: LoadOsmFromPbfUseCase;
    private loadCsvUseCase?: LoadCsvUseCase;
    private loadLayerUseCase?: LoadLayerUseCase;
    private loadCustomLayerUseCase?: LoadCustomLayerUseCase;
    private assignBuildingIdsUseCase?: AssignBuildingIdsUseCase;
    private loadJsonUseCase?: LoadJsonUseCase;
    private getLayerGeojsonUseCase?: GetLayerGeojsonUseCase;
    private spatialJoinUseCase?: SpatialJoinUseCase;
    private getBoundingBoxFromLayerUseCase?: GetBoundingBoxFromLayerUseCase;
    private dropTableUseCase?: DropTableUseCase;
    private transformBoundingBoxCoordinatesUseCase?: TransformBoundingBoxCoordinatesUseCase;
    private loadGridLayerUseCase?: LoadGridLayerUseCase;
    private loadGeoTiffUseCase?: LoadGeoTiffUseCase;
    private rawQueryUseCase?: RawQueryUseCase;
    private getBoundingBoxFromOsmUseCase?: GetBoundingBoxFromOsmUseCase;
    private polygonizeSurfaceLayerUseCase?: PolygonizeSurfaceLayerUseCase;
    private buildHeatmapUseCase?: BuildHeatmapUseCase;
    private getTableDataUseCase?: GetTableDataUseCase;
    private updateTableUseCase?: UpdateTableUseCase;

    /**
     * Returns metadata for all tables in the current workspace.
     * @returns Array of table metadata objects.
     */
    get tables(): Array<Table> {
        return this.getCurrentWorkspaceData().tables;
    }

    /**
     * Initializes DuckDB and the spatial extension, creating the default workspace.
     *
     * @note Must be called before any other method.
     * @throws If DuckDB WebAssembly fails to load or the spatial extension cannot be installed.
     * @example
     * const db = new AutkDb();
     * await db.init();
     */
    async init() {
        this.db = await loadDb();
        this.conn = await this.db.connect();

        await this.conn.query('INSTALL spatial; LOAD spatial;');
        await this.conn.query(`CREATE SCHEMA IF NOT EXISTS ${DEFAULT_WORKSPACE_NAME}`);
        await this.conn.query(`USE ${DEFAULT_WORKSPACE_NAME}`);

        this.workspaces.set(DEFAULT_WORKSPACE_NAME, {
            tables: [],
            coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT,
            workspaceBoundingBox: undefined,
            osmBoundingBox: undefined,
        });

        this.osmProcessingPipeline = new OsmProcessingPipeline(this.db, this.conn);
        this.loadOsmFromOverpassApiUseCase = new LoadOsmFromOverpassApiUseCase(this.conn, this.osmProcessingPipeline);
        this.loadOsmFromPbfUseCase = new LoadOsmFromPbfUseCase(this.conn, this.osmProcessingPipeline);

        this.loadCsvUseCase = new LoadCsvUseCase(this.db, this.conn);
        this.loadJsonUseCase = new LoadJsonUseCase(this.db, this.conn);
        this.loadLayerUseCase = new LoadLayerUseCase(this.db, this.conn);
        this.loadCustomLayerUseCase = new LoadCustomLayerUseCase(this.db, this.conn);
        this.loadGridLayerUseCase = new LoadGridLayerUseCase(this.conn);
        this.loadGeoTiffUseCase = new LoadGeoTiffUseCase(this.db, this.conn);

        this.assignBuildingIdsUseCase = new AssignBuildingIdsUseCase(this.db, this.conn);
        this.polygonizeSurfaceLayerUseCase = new PolygonizeSurfaceLayerUseCase(this.db, this.conn);

        this.spatialJoinUseCase = new SpatialJoinUseCase(this.conn);
        this.buildHeatmapUseCase = new BuildHeatmapUseCase(this.conn);

        this.transformBoundingBoxCoordinatesUseCase = new TransformBoundingBoxCoordinatesUseCase(this.conn);

        this.getBoundingBoxFromLayerUseCase = new GetBoundingBoxFromLayerUseCase(this.conn);
        this.getLayerGeojsonUseCase = new GetLayerGeojsonUseCase(this.conn);
        this.getBoundingBoxFromOsmUseCase = new GetBoundingBoxFromOsmUseCase(this.conn);
        this.getTableDataUseCase = new GetTableDataUseCase(this.conn);

        this.updateTableUseCase = new UpdateTableUseCase(this.db, this.conn);
        this.dropTableUseCase = new DropTableUseCase(this.conn);

        this.rawQueryUseCase = new RawQueryUseCase(this.conn);
    }

    /**
     * Switches to a workspace, creating it with a new schema if it doesn't exist.
     *
     * @param name - The name of the workspace to activate.
     * @throws If the database has not been initialized.
     * @example
     * await db.setWorkspace('my-analysis');
     * await db.loadCsv({ csvFileUrl: '/data.csv', outputTableName: 'points' });
     */
    async setWorkspace(name: string): Promise<void> {
        if (!this.conn) {
            throw new Error('Database not initialized. Please call init() first.');
        }

        if (!this.workspaces.has(name)) {
            await this.conn.query(`CREATE SCHEMA IF NOT EXISTS ${name}`);
            this.workspaces.set(name, {
                tables: [],
                coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT,
                workspaceBoundingBox: undefined,
                osmBoundingBox: undefined,
            });
        }

        await this.conn.query(`USE ${name}`);
        this.currentWorkspace = name;
    }

    /**
     * Sets the target CRS for all geometries stored in the current workspace.
     *
     * @param format - EPSG code for the target coordinate reference system.
     * @example
     * db.setWorkspaceCoordinateFormat('EPSG:3395');
     */
    setWorkspaceCoordinateFormat(format: string): void {
        this.getCurrentWorkspaceData().coordinateFormat = format;
    }

    /**
     * Returns all registered workspace names.
     *
     * @returns Array of workspace names.
     * @example
     * const names = db.getWorkspaces();
     * console.log(names); // ['autk', 'analysis-a']
     */
    getWorkspaces(): string[] {
        return Array.from(this.workspaces.keys());
    }

    /**
     * Returns the name of the currently active workspace.
     *
     * @returns Current workspace name.
     * @example
     * console.log(db.getCurrentWorkspace()); // 'autk'
     */
    getCurrentWorkspace(): string {
        return this.currentWorkspace;
    }

    /**
     * Returns the target CRS used for storing geometries in the current workspace.
     *
     * @returns The workspace coordinate format EPSG string.
     * @example
     * const format = db.getWorkspaceCoordinateFormat();
     * console.log(format); // 'EPSG:3395'
     */
    getWorkspaceCoordinateFormat(): string {
        return this.getCurrentWorkspaceData().coordinateFormat;
    }

    // ---- LOAD's methods

    /**
     * Loads OpenStreetMap data from the Overpass API or a PBF file, optionally extracting thematic layers.
     *
     * When `autoLoadLayers` is provided, extracts buildings, roads, parks, water, and surface layers.
     * The surface layer is polygonized and other layers are clipped to its geometry.
     *
     * @param params - Area query, output table name, and optional layer extraction settings.
     * @returns Timing breakdown for OSM download and layer extraction.
     * @throws If the database is not initialized.
     * @example
     * const timings = await db.loadOsm({
     *   outputTableName: 'manhattan',
     *   queryArea: { geocodeArea: 'New York', areas: ['Manhattan Island'] },
     *   autoLoadLayers: {
     *     layers: ['buildings', 'roads', 'surface'],
     *     dropOsmTable: true,
     *   },
     * });
     */
    async loadOsm(params: LoadOsmParams): Promise<OsmLoadTimings> {
        if (
            !this.db ||
            !this.conn ||
            !this.loadOsmFromOverpassApiUseCase ||
            !this.loadOsmFromPbfUseCase ||
            !this.dropTableUseCase ||
            !this.getBoundingBoxFromOsmUseCase ||
            !this.transformBoundingBoxCoordinatesUseCase ||
            !this.polygonizeSurfaceLayerUseCase
        )
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const targetCrs = workspaceData.coordinateFormat;
        const sourceCrs = params.autoLoadLayers?.coordinateFormat ?? DEFAULT_INPUT_COORDINATE_FORMAT;

        const execResult = params.pbfFileUrl
            ? await this.loadOsmFromPbfUseCase.exec({ ...params, workspace: this.currentWorkspace })
            : await this.loadOsmFromOverpassApiUseCase.exec({ ...params, workspace: this.currentWorkspace });
        for (const table of execResult.tables) {
            this.registerTable(table);
        }

        const timings: OsmLoadTimings = {
            osmElementCount: execResult.osmElementCount,
            boundaryElementCount: execResult.boundaryElementCount,
            osmDataProcessingMs: execResult.osmDataProcessingMs,
            boundariesProcessingMs: execResult.boundariesProcessingMs,
            layers: [],
        };

        if (params.autoLoadLayers) {
            const boundaryTableName = `${params.outputTableName}_boundaries`;
            const rawBoundingBox = await this.getBoundingBoxFromOsmUseCase.exec({
                osmTableName: boundaryTableName,
                workspace: this.currentWorkspace
            });

            workspaceData.osmBoundingBox = await this.transformBoundingBoxCoordinatesUseCase.exec({
                boundingBox: rawBoundingBox,
                coordinateFormat: targetCrs,
            });
            workspaceData.workspaceBoundingBox = workspaceData.osmBoundingBox;

            let surfaceLayerName: string | null = null;
            const clippableLayerNames: string[] = [];

            for (const layer of params.autoLoadLayers.layers) {
                const shouldCropToBbox = layer !== 'buildings';

                const layerParams: LoadLayerParams = {
                    osmInputTableName: params.outputTableName,
                    coordinateFormat: sourceCrs,
                    layer,
                };

                layerParams.boundingBox = shouldCropToBbox ? workspaceData.osmBoundingBox : undefined;

                const t0 = performance.now();
                const layerTable = await this.loadLayer({ ...layerParams, workspaceCoordinateFormat: targetCrs });
                const loadMs = performance.now() - t0;

                const countResult = await this.conn.query(
                    `SELECT COUNT(*) as cnt FROM ${this.currentWorkspace}.${layerTable.name}`
                );
                const featureCount = Number(countResult.toArray()[0].cnt);

                timings.layers.push({ layerName: layerTable.name, layerType: layer, loadMs, featureCount });

                if (layer === 'surface') {
                    const updatedTable = await this.polygonizeSurfaceLayerUseCase.exec(
                        { surfaceTableName: layerTable.name, workspace: this.currentWorkspace },
                        layerTable
                    );
                    const tableIndex = workspaceData.tables.findIndex((t) => t.name === layerTable.name);
                    if (tableIndex !== -1) workspaceData.tables[tableIndex] = updatedTable;
                    surfaceLayerName = layerTable.name;
                } else {
                    clippableLayerNames.push(layerTable.name);
                }
            }

            if (surfaceLayerName && clippableLayerNames.length > 0) {
                for (const layerName of clippableLayerNames) {
                    const cropGeometry = !layerName.endsWith('_buildings');
                    await this.clipLayerToSurface(layerName, surfaceLayerName, this.currentWorkspace, cropGeometry);
                }
            }

            if (params.autoLoadLayers.dropOsmTable) {
                for (const table of execResult.tables) {
                    await this.dropTableUseCase.exec({ tableName: table.name, workspace: this.currentWorkspace });
                    workspaceData.tables = workspaceData.tables.filter((t) => t.name !== table.name);
                }
            }

            console.log(`OSM data loaded and completed in workspace '${this.currentWorkspace}'!`);
        }

        return timings;
    }

    /**
     * Loads a CSV file into the database, optionally creating a geometry column from lat/lng columns.
     *
     * @param params - File URL or array, table name, and optional coordinate column mapping.
     * @returns The created CSV table metadata.
     * @throws If the database is not initialized, or both `csvFileUrl` and `csvObject` are provided.
     * @example
     * const table = await db.loadCsv({
     *   csvFileUrl: '/data/stations.csv',
     *   outputTableName: 'stations',
     *   geometryColumns: { latColumnName: 'lat', longColumnName: 'lng' },
     * });
     */
    async loadCsv(params: LoadCsvParams): Promise<CsvTable> {
        if (!this.db || !this.conn || !this.loadCsvUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.loadCsvUseCase.exec({
            ...params,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: workspaceData.coordinateFormat,
        });
        this.registerTable(table);

        return table;
    }

    /**
     * Loads a JSON array into the database, optionally creating a geometry column from lat/lng columns.
     *
     * @param params - File URL or array, table name, and optional coordinate column mapping.
     * @returns The created JSON table metadata.
     * @throws If the database is not initialized, or both `jsonFileUrl` and `jsonObject` are provided.
     * @example
     * const table = await db.loadJson({
     *   jsonFileUrl: '/data/events.json',
     *   outputTableName: 'events',
     * });
     */
    async loadJson(params: LoadJsonParams): Promise<JsonTable> {
        if (!this.db || !this.conn || !this.loadJsonUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.loadJsonUseCase.exec({
            ...params,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: workspaceData.coordinateFormat,
        });
        this.registerTable(table);

        return table;
    }

    /**
     * Extracts a thematic layer (roads, buildings, parks, water, surface) from a loaded OSM table.
     *
     * @param params - OSM table name, layer type, and optional bounding box for cropping.
     * @returns The created layer table metadata.
     * @throws If the database is not initialized, the OSM table is missing, or the table is not a raw OSM table.
     * @example
     * const buildings = await db.loadLayer({
     *   osmInputTableName: 'manhattan',
     *   layer: 'buildings',
     * });
     */
    async loadLayer(params: LoadLayerParams & { workspaceCoordinateFormat?: string }): Promise<OsmLayerTable> {
        if (!this.db || !this.conn || !this.loadLayerUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const osmTable = this.tables.find((t) => t.name === params.osmInputTableName);
        if (!osmTable) throw new Error(`Table ${params.osmInputTableName} not found.`);
        if (!isOsmTable(osmTable))
            throw new Error(`Table ${params.osmInputTableName} is not a raw OSM table.`);

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.loadLayerUseCase.exec({
            ...params,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: params.workspaceCoordinateFormat ?? workspaceData.coordinateFormat,
        });
        this.registerTable(table);

        return table;
    }

    /**
     * Loads a GeoJSON FeatureCollection as a spatial layer, optionally auto-clipping to the OSM bounding box.
     *
     * When `layerType` is `'buildings'`, computes `building_id` by clustering overlapping geometries.
     *
     * @param params - File URL or object, table name, and layer type.
     * @returns The created custom layer table metadata.
     * @throws If the database is not initialized, or the GeoJSON is not a FeatureCollection.
     * @example
     * const neighborhoods = await db.loadCustomLayer({
     *   geojsonFileUrl: '/data/neighborhoods.geojson',
     *   outputTableName: 'neighborhoods',
     *   layerType: 'parks',
     * });
     */
    async loadCustomLayer(params: LoadCustomLayerParams): Promise<GeojsonTable> {
        if (
            !this.db ||
            !this.conn ||
            !this.loadCustomLayerUseCase ||
            !this.assignBuildingIdsUseCase ||
            !this.getBoundingBoxFromLayerUseCase
        )
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.loadCustomLayerUseCase.exec({
            ...params,
            boundingBox: workspaceData.osmBoundingBox,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: workspaceData.coordinateFormat,
        });
        this.registerTable(table);

        if (!workspaceData.workspaceBoundingBox) {
            workspaceData.workspaceBoundingBox = await this.getBoundingBoxFromLayerUseCase.exec({
                layerTableName: table.name,
                workspace: this.currentWorkspace,
            });
        }

        if (params.layerType === 'buildings') {
            const columns = await this.assignBuildingIdsUseCase.exec({
                tableName: table.name,
                workspace: this.currentWorkspace,
            });
            table.columns = columns;
        }

        return table;
    }

    /**
     * Creates a grid of evenly-spaced cell centroids within a bounding box.
     *
     * @param params - Grid dimensions, output table name, and optional bounding box (falls back to OSM bounds).
     * @returns The created grid layer table metadata.
     * @throws If the database is not initialized, or no bounding box is available and none is provided.
     * @example
     * const grid = await db.loadGridLayer({
     *   outputTableName: 'heatmap_grid',
     *   rows: 100,
     *   columns: 100,
     * });
     */
    async loadGridLayer(params: LoadGridLayerParams): Promise<GridTable> {
        if (!this.db || !this.conn || !this.loadGridLayerUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.loadGridLayerUseCase.exec({
            ...params,
            boundingBox: params.boundingBox || workspaceData.osmBoundingBox,
            workspace: this.currentWorkspace
        });
        this.registerTable(table);

        return table;
    }

    /**
     * Loads a GeoTIFF raster as a spatially-indexed table with per-pixel geometry and band properties.
     *
     * @param params - File URL or ArrayBuffer, table name, and optional CRS override.
     * @returns The created GeoTIFF table metadata.
     * @throws If the database is not initialized, both sources are provided, or the raster exceeds `maxPixels`.
     * @example
     * const raster = await db.loadGeoTiff({
     *   geotiffFileUrl: '/data/lst.tif',
     *   outputTableName: 'temperature',
     * });
     */
    async loadGeoTiff(params: LoadGeoTiffParams): Promise<GeotiffTable> {
        if (!this.db || !this.conn || !this.loadGeoTiffUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.loadGeoTiffUseCase.exec({
            ...params,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: workspaceData.coordinateFormat,
        });
        this.registerTable(table);

        return table;
    }

    /**
     * Exports a loaded GeoTIFF table as a packed raster FeatureCollection for rendering.
     *
     * Pass the result to `AutkMap.loadRasterCollection()` with a property callback that extracts the desired band.
     *
     * @param tableName - Name of the GeoTIFF table created by `loadGeoTiff`.
     * @returns A FeatureCollection with a single feature containing pixel data and resolution metadata.
     * @throws If the database is not initialized, the table is missing, or it is not a GeoTIFF table.
     * @example
     * const fc = await db.getGeoTiffLayer('temperature');
     * map.loadRasterCollection('temperature', {
     *   collection: fc,
     *   property: (cell) => cell.band_1,
     * });
     */
    async getGeoTiffLayer(tableName: string): Promise<FeatureCollection<null>> {
        if (!this.db || !this.conn)
            throw new Error('Database not initialized. Please call init() first.');

        const table = this.tables.find((t) => t.name === tableName);
        if (!table || !isGeotiffTable(table))
            throw new Error(`Table ${tableName} is not a GeoTiff table.`);

        const qualifiedName = `${this.currentWorkspace}.${tableName}`;

        const result = await this.conn.query(`
      WITH pixels AS (
        SELECT
          t.properties AS properties,
          ST_X(t.geometry) AS px,
          ST_Y(t.geometry) AS py
        FROM ${qualifiedName} t
      )
      SELECT
        COUNT(DISTINCT ROUND(px, 8))::INTEGER AS res_x,
        COUNT(DISTINCT ROUND(py, 8))::INTEGER AS res_y,
        MIN(px) AS min_lon,
        MIN(py) AS min_lat,
        MAX(px) AS max_lon,
        MAX(py) AS max_lat,
        list(properties ORDER BY py ASC, px ASC) AS raster
      FROM pixels
    `);

        const row = toPlain(result.toArray()[0]?.toJSON());
        if (!row) throw new Error(`No data found in GeoTiff table ${tableName}.`);

        const { res_x, res_y, min_lon, min_lat, max_lon, max_lat, raster } = row;

        const spacingX = Number(res_x) > 1 ? Math.abs((Number(max_lon) - Number(min_lon)) / (Number(res_x) - 1)) : null;
        const spacingY = Number(res_y) > 1 ? Math.abs((Number(max_lat) - Number(min_lat)) / (Number(res_y) - 1)) : null;
        const halfX = (spacingX ?? spacingY ?? 0) / 2;
        const halfY = (spacingY ?? spacingX ?? 0) / 2;

        return {
            type: 'FeatureCollection',
            bbox: [Number(min_lon) - halfX, Number(min_lat) - halfY, Number(max_lon) + halfX, Number(max_lat) + halfY],
            features: [
                {
                    type: 'Feature',
                    geometry: null,
                    properties: {
                        rasterResX: res_x,
                        rasterResY: res_y,
                        raster,
                    },
                },
            ],
        };
    }

    /**
     * Exports a loaded layer as a GeoJSON FeatureCollection with an automatically computed bounding box.
     *
     * The bbox is resolved from the OSM boundingBox, then the workspace bounds, then the layer's own bounds.
     *
     * @param layerTableName - Name of the layer table to export.
     * @returns A FeatureCollection with a `bbox` property.
     * @throws If the database is not initialized, the table is missing, or it is not a layer table.
     * @example
     * const buildings = await db.getLayer('osm_buildings');
     * map.loadCollection('buildings', { collection: buildings, type: 'buildings' });
     */
    async getLayer(layerTableName: string): Promise<FeatureCollection> {
        if (!this.db || !this.conn || !this.getLayerGeojsonUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const layerTable = this.tables.find((t) => t.name === layerTableName);
        if (!layerTable) throw new Error(`Table ${layerTableName} not found.`);
        if (!isCollectionLayerTable(layerTable)) throw new Error(`Table ${layerTableName} is not a layer table.`);

        const featureCollection = await this.getLayerGeojsonUseCase.exec(layerTable, this.currentWorkspace);

        const workspaceData = this.getCurrentWorkspaceData();
        const osmBoundingBox = this.getOsmBoundingBox();
        if (osmBoundingBox) {
            featureCollection.bbox = osmBoundingBox;
        } else if (workspaceData.workspaceBoundingBox) {
            featureCollection.bbox = [
                workspaceData.workspaceBoundingBox.minLon,
                workspaceData.workspaceBoundingBox.minLat,
                workspaceData.workspaceBoundingBox.maxLon,
                workspaceData.workspaceBoundingBox.maxLat,
            ];
        } else {
            const layerBoundingBox = await this.getBoundingBoxFromLayer(layerTableName);
            featureCollection.bbox = [
                layerBoundingBox.minLon,
                layerBoundingBox.minLat,
                layerBoundingBox.maxLon,
                layerBoundingBox.maxLat,
            ];
        }

        return featureCollection;
    }

    /**
     * Returns the OSM bounding box for the current workspace, transformed to the workspace CRS.
     *
     * @returns `[minLon, minLat, maxLon, maxLat]` in the workspace CRS, or `null` if no OSM data is loaded.
     * @example
     * const bbox = db.getOsmBoundingBox();
     * if (bbox) console.log(`Bounds: ${bbox[0]} to ${bbox[2]}`);
     */
    getOsmBoundingBox(): [number, number, number, number] | null {
        const workspaceData = this.getCurrentWorkspaceData();
        if (!workspaceData.osmBoundingBox) return null;

        return [
            workspaceData.osmBoundingBox.minLon,
            workspaceData.osmBoundingBox.minLat,
            workspaceData.osmBoundingBox.maxLon,
            workspaceData.osmBoundingBox.maxLat,
        ]
    }

    /**
     * Computes the bounding box of a layer from its geometry column.
     *
     * @param layerName - Name of the layer table.
     * @returns The layer bounding box.
     * @throws If the database is not initialized, the table is missing, or it has no geometry column.
     * @example
     * const bbox = await db.getBoundingBoxFromLayer('osm_buildings');
     * console.log(bbox.minLon, bbox.maxLon);
     */
    async getBoundingBoxFromLayer(layerName: string): Promise<BoundingBox> {
        if (!this.db || !this.conn || !this.getBoundingBoxFromLayerUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const layerTable = this.tables.find((t) => t.name === layerName);
        if (!layerTable) throw new Error(`Table ${layerName} not found.`);

        const hasGeometry = layerTable.columns.find((column) => column.type === 'GEOMETRY');
        if (!hasGeometry) {
            throw new Error(
                `Table ${layerName} does not have a geometry column. This method only works with layer tables that contain geometries.`,
            );
        }

        return this.getBoundingBoxFromLayerUseCase.exec({
            layerTableName: layerName,
            workspace: this.currentWorkspace,
        });
    }

    /**
     * Returns all tables that represent renderable spatial layers.
     *
     * @returns Filtered array of OSM, GeoJSON, and user layer tables.
     * @example
     * const layers = db.getLayerTables();
     * for (const l of layers) await map.loadCollection(l.name, { collection: await db.getLayer(l.name), type: l.type });
     */
    getLayerTables(): Array<CollectionLayerTable> {
        return this.tables.filter((table): table is CollectionLayerTable => {
            return isCollectionLayerTable(table);
        });
    }

    /**
     * Reads rows from any table as plain JavaScript objects, with optional pagination.
     *
     * @param params - Table name and optional `limit` / `offset`.
     * @returns The table data and pagination metadata.
     * @throws If the database is not initialized or the table is not found.
     * @example
     * const result = await db.getTableData({ tableName: 'stations', limit: 100 });
     * console.log(result.data[0]);
     */
    async getTableData(params: GetTableDataParams): Promise<GetTableDataOutput> {
        if (!this.db || !this.conn || !this.getTableDataUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const table = this.tables.find((t) => t.name === params.tableName);
        if (!table) throw new Error(`Table ${params.tableName} not found.`);

        return this.getTableDataUseCase.exec({ ...params, workspace: this.currentWorkspace });
    }

    /**
     * Updates an existing table with new data using a replace or record-level update strategy.
     *
     * @param params - Table name, data, strategy (`'replace'` or `'update'`), and optional `idColumn` for update strategy.
     * @returns The updated table with refreshed column metadata.
     * @throws If the database is not initialized, the table is missing, or `idColumn` is required but omitted.
     * @example
     * await db.updateTable({
     *   tableName: 'stations',
     *   data: updatedRows,
     *   strategy: 'replace',
     * });
     */
    async updateTable(params: Omit<UpdateTableParams, 'workspace'>): Promise<Table> {
        if (!this.db || !this.conn || !this.updateTableUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const table = this.tables.find((t) => t.name === params.tableName);
        if (!table) throw new Error(`Table ${params.tableName} not found.`);

        const result = await this.updateTableUseCase.exec(
            { ...params, workspace: this.currentWorkspace },
            table
        );

        const workspaceData = this.getCurrentWorkspaceData();
        const tableIndex = workspaceData.tables.findIndex((t) => t.name === params.tableName);
        if (tableIndex !== -1) {
            workspaceData.tables[tableIndex] = result.table;
        }

        return result.table;
    }

    /**
     * Performs a spatial join between two tables using predicates like INTERSECT, NEAR, or CONTAINS.
     *
     * @param params - Root and join table names, spatial predicate, output configuration, and optional grouping.
     * @returns The resulting joined table, newly created or updated.
     * @throws If the database is not initialized.
     * @example
     * await db.spatialQuery({
     *   tableRootName: 'roads',
     *   tableJoinName: 'lst',
     *   spatialPredicate: 'NEAR',
     *   nearDistance: 1000,
     *   output: { type: 'MODIFY_ROOT' },
     * });
     */
    async spatialQuery(params: SpatialQueryParams): Promise<Table> {
        if (!this.db || !this.conn || !this.spatialJoinUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const { created, table } = await this.spatialJoinUseCase.exec(params, workspaceData.tables, this.currentWorkspace);
        if (created) this.registerTable(table);
        else workspaceData.tables = workspaceData.tables.map((t) => (t.name === table.name ? table : t));

        return table;
    }

    /**
     * Executes arbitrary SQL against the current workspace.
     *
     * @param params - SQL query string and optional output configuration to create a table from the result.
     * @returns The raw query result, or a Table if `output.type` is `'CREATE_TABLE'`.
     * @throws If the database is not initialized.
     * @example
     * const result = await db.rawQuery({
     *   query: 'SELECT COUNT(*) as cnt FROM manhattan_buildings',
     * });
     */
    async rawQuery<T = RawQueryOutput>(params: RawQueryParams): Promise<T | Table> {
        if (!this.db || !this.conn || !this.rawQueryUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const result = await this.rawQueryUseCase.exec(params, this.currentWorkspace);

        if (params.output.type === 'CREATE_TABLE') {
            this.registerTable(result as Table);
            return result as Table;
        }

        return result as unknown as T;
    }

    /**
     * Drops a table from the database and removes it from the current workspace registry.
     *
     * @param tableName - Name of the table to remove.
     * @throws If the database is not initialized.
     * @example
     * await db.removeLayer('osm_raw');
     */
    async removeLayer(tableName: string): Promise<void> {
        if (!this.conn || !this.dropTableUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        await this.dropTableUseCase.exec({ tableName, workspace: this.currentWorkspace });

        const workspaceData = this.getCurrentWorkspaceData();
        workspaceData.tables = workspaceData.tables.filter((t) => t.name !== tableName);
    }

    /**
     * Builds a heatmap by creating a grid over a bounding box and aggregating source table values into each cell.
     *
     * @param params - Source table, grid configuration, and aggregation method.
     * @returns The resulting GridLayerTable containing aggregated heatmap data.
     * @throws If the database is not initialized.
     * @example
     * const heatmap = await db.buildHeatmap({
     *   sourceTable: 'incidents',
     *   outputTableName: 'heatmap_result',
     *   rows: 50,
     *   columns: 50,
     *   aggregateFunction: 'count',
     * });
     */
    async buildHeatmap(params: BuildHeatmapParams): Promise<Table> {
        if (!this.db || !this.conn || !this.buildHeatmapUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.buildHeatmapUseCase.exec(params, workspaceData.tables, workspaceData.workspaceBoundingBox, this.currentWorkspace);
        this.registerTable(table);

        return table;
    }

    // ---- Private methods

    /**
     * Retrieves the workspace data for the current workspace.
     *
     * @returns The workspace data object.
     * @throws If the current workspace does not exist in the internal map.
     */
    private getCurrentWorkspaceData(): WorkspaceData {
        const data = this.workspaces.get(this.currentWorkspace);
        if (!data) {
            throw new Error(`Workspace '${this.currentWorkspace}' not found. This should not happen.`);
        }
        return data;
    }

    /**
     * Registers a table in the current workspace, replacing any existing table with the same name.
     *
     * @param table - The table metadata to register.
     * @note Logs a warning if a table with the same name is being overwritten.
     */
    private registerTable(table: Table): void {
        const workspaceData = this.getCurrentWorkspaceData();
        const existingIndex = workspaceData.tables.findIndex((t) => t.name === table.name);

        if (existingIndex !== -1) {
            console.warn(`Table '${table.name}' already exists in workspace '${this.currentWorkspace}'. Overwriting...`);
            workspaceData.tables[existingIndex] = table;
        } else {
            workspaceData.tables.push(table);
        }
    }

    /**
     * Clips thematic layer geometries to the surface layer polygon using `ST_Intersection`.
     *
     * @param layerTableName - The layer table to clip.
     * @param surfaceTableName - The surface table used as the clipping boundary.
     * @param workspace - The workspace schema containing both tables.
     * @param cropGeometry - When true, replaces geometries with their clipped version; otherwise filters rows only.
     */
    private async clipLayerToSurface(
        layerTableName: string,
        surfaceTableName: string,
        workspace: string,
        cropGeometry: boolean = true,
    ): Promise<void> {
        const qualifiedLayer = `${workspace}.${layerTableName}`;
        const qualifiedSurface = `${workspace}.${surfaceTableName}`;
        const geometrySelect = cropGeometry ? 'ST_Intersection(l.geometry, surf.geom)' : 'l.geometry';
        const emptyFilter = cropGeometry ? 'WHERE NOT ST_IsEmpty(geometry)' : '';

        await this.conn!.query(`
      CREATE OR REPLACE TABLE ${qualifiedLayer} AS
      WITH surf AS (
        SELECT ST_Union_Agg(geometry) AS geom FROM ${qualifiedSurface}
      ),
      clipped AS (
        SELECT l.* EXCLUDE (geometry),
          ${geometrySelect} AS geometry
        FROM ${qualifiedLayer} l, surf
        WHERE ST_Intersects(l.geometry, surf.geom)
      )
      SELECT * FROM clipped
      ${emptyFilter};
    `);
    }
}
