import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection } from 'geojson';

import { loadDb } from './duckdb';

import {
    CsvTable,
    GeotiffTable,
    GeojsonTable,
    isRasterTable,
    isRenderableTable,
    isVectorTable,
    JsonTable,
    OsmLayerTable,
    Table,
} from './interfaces';
import type { WorkspaceData } from './interfaces';
import type { BoundingBox, LayerType } from '@urban-toolkit/autk-core';

import {
    DEFAULT_WORKSPACE_NAME,
    DEFAULT_INPUT_COORDINATE_FORMAT,
    DEFAULT_WORKSPACE_COORDINATE_FORMAT
} from './consts';

import { getColumnsFromDuckDbTableDescribe } from './utils';

import { DropTableUseCase } from './use-cases/drop-table';
import { GetLayerBboxUseCase } from './use-cases/get-layer-bbox';
import { GetOsmBboxUseCase } from './internal/get-osm-bbox/use-case';
import { BuildHeatmapParams, BuildHeatmapUseCase } from './use-cases/build-heatmap';
import { GetLayerUseCase } from './use-cases/get-layer';
import { GetRasterUseCase } from './use-cases/get-raster';
import { GetTableOutput, GetTableUseCase } from './use-cases/get-table';
import { LoadCsvParams, LoadCsvUseCase } from './use-cases/load-csv';
import { LoadGeojsonParams, LoadGeojsonUseCase } from './use-cases/load-geojson';
import { LoadGeoTiffParams, LoadGeoTiffUseCase } from './use-cases/load-geotiff';
import { deleteRasterPayload } from './raster-store';
import { LoadJsonParams, LoadJsonUseCase } from './use-cases/load-json';
import { LoadOsmLayerParams, LoadOsmLayerUseCase } from './use-cases/load-osm-layer';
import { LoadOsmFromOverpassApiUseCase, LoadOsmParams, OsmLoadTimings } from './use-cases/load-osm-overpass';
import { LoadOsmFromPbfUseCase } from './use-cases/load-osm-pbf';
import { OsmProcessingPipeline } from './internal/process-osm/pipeline';
import { PolygonizeOsmSurfaceUseCase } from './internal/process-osm-surface/use-case';
import { RawQueryParams, RawQueryUseCase, RawQueryOutput } from './use-cases/raw-query';
import { SpatialJoinUseCase, SpatialQueryParams } from './use-cases/spatial-join';
import { UpdateTableParams, UpdateTableUseCase } from './use-cases/update-table';

/**
 * DuckDB-backed spatial database for loading, querying, and managing urban datasets.
 *
 * Supports multiple isolated workspaces, each with its own schema, registered tables, and cached spatial metadata.
 *
 * @throws Never throws. Initialization happens later via `init()`.
 * @example
 * const db = new AutkDb();
 * await db.init();
 * await db.loadOsm({
 *   queryArea: { geocodeArea: 'New York', areas: ['Manhattan Island'] },
 *   autoLoadLayers: { layers: ['buildings', 'roads', 'parks', 'water'] },
 * });
 */
export class AutkDb {
    /** DuckDB database instance created during initialization. */
    private db?: AsyncDuckDB;

    /** Active DuckDB connection used by all queries and loaders. */
    private conn?: AsyncDuckDBConnection;

    /** Name of the workspace schema currently selected for operations. */
    private currentWorkspace: string = DEFAULT_WORKSPACE_NAME;

    /** In-memory registry of workspace metadata keyed by schema name. */
    private workspaces: Map<string, WorkspaceData> = new Map();

    /** Shared OSM processing pipeline used by OSM loading use cases. */
    private osmProcessingPipeline?: OsmProcessingPipeline;

    /** Overpass-based OSM loader initialized after the database connection is ready. */
    private loadOsmFromOverpassApiUseCase?: LoadOsmFromOverpassApiUseCase;

    /** PBF-based OSM loader initialized after the database connection is ready. */
    private loadOsmFromPbfUseCase?: LoadOsmFromPbfUseCase;

    /** CSV loading use case bound to the active database connection. */
    private loadCsvUseCase?: LoadCsvUseCase;

    /** OSM layer extraction use case bound to the active database connection. */
    private loadOsmLayerUseCase?: LoadOsmLayerUseCase;

    /** GeoJSON layer loading use case bound to the active database connection. */
    private loadGeojsonUseCase?: LoadGeojsonUseCase;

    /** JSON loading use case bound to the active database connection. */
    private loadJsonUseCase?: LoadJsonUseCase;

    /** GeoJSON export use case for renderable layer tables. */
    private getLayerUseCase?: GetLayerUseCase;

    /** Spatial join use case used by higher-level query operations. */
    private spatialJoinUseCase?: SpatialJoinUseCase;

    /** Geometry extent query use case for renderable layers. */
    private getLayerBboxUseCase?: GetLayerBboxUseCase;

    /** Table drop use case used for cleanup and overwrite flows. */
    private dropTableUseCase?: DropTableUseCase;

    /** GeoTIFF raster loading use case bound to the active database connection. */
    private loadGeoTiffUseCase?: LoadGeoTiffUseCase;

    /** Arbitrary SQL execution use case bound to the active database connection. */
    private rawQueryUseCase?: RawQueryUseCase;

    /** OSM extent extraction use case for newly loaded OSM datasets. */
    private getOsmBboxUseCase?: GetOsmBboxUseCase;

    /** Surface polygonization use case for converting surface lines into polygons. */
    private polygonizeOsmSurfaceUseCase?: PolygonizeOsmSurfaceUseCase;

    /** Heatmap construction use case that aggregates source values into grid cells. */
    private buildHeatmapUseCase?: BuildHeatmapUseCase;

    /** Table data reader use case for plain-object row output. */
    private getTableUseCase?: GetTableUseCase;

    /** Raster export use case for packed FeatureCollection output. */
    private getRasterUseCase?: GetRasterUseCase;

    /** Table update use case for replace and keyed update strategies. */
    private updateTableUseCase?: UpdateTableUseCase;

    /**
     * Returns metadata for all tables in the current workspace.
     *
     * Exposes the live table registry for the active workspace without querying DuckDB again.
     *
     * @returns Array of table metadata objects for the current workspace.
     * @throws If the active workspace is missing from the internal registry.
     * @example
     * const tables = db.getTablesMetadata();
     * console.log(tables.map((table) => table.name));
     */
    getTablesMetadata(): Array<Table> {
        return this.getCurrentWorkspaceData().tables;
    }

    /**
     * Initializes DuckDB and the spatial extension for use by the database wrapper.
     *
     * Must be called before any other database operation so workspaces, use cases, and the shared connection are ready.
     *
     * @returns Resolves when DuckDB, the spatial extension, and the default workspace have been initialized.
     * @throws If DuckDB WebAssembly fails to load, the connection cannot be opened, or the spatial extension cannot be installed.
     * @example
     * const db = new AutkDb();
     * await db.init();
     */
    async init(): Promise<void> {
        this.db = await loadDb();
        this.conn = await this.db.connect();

        await this.conn.query('INSTALL spatial; LOAD spatial;');
        await this.conn.query(`CREATE SCHEMA IF NOT EXISTS ${DEFAULT_WORKSPACE_NAME}`);
        await this.conn.query(`USE ${DEFAULT_WORKSPACE_NAME}`);

        this.workspaces.set(DEFAULT_WORKSPACE_NAME, {
            tables: [],
            coordinateFormat: DEFAULT_WORKSPACE_COORDINATE_FORMAT,
            workspaceBoundingBox: undefined,
            workspaceCropLayer: null,
        });

        this.osmProcessingPipeline = new OsmProcessingPipeline(this.db, this.conn);
        this.loadOsmFromOverpassApiUseCase = new LoadOsmFromOverpassApiUseCase(this.conn, this.osmProcessingPipeline);
        this.loadOsmFromPbfUseCase = new LoadOsmFromPbfUseCase(this.conn, this.osmProcessingPipeline);

        this.loadCsvUseCase = new LoadCsvUseCase(this.db, this.conn);
        this.loadJsonUseCase = new LoadJsonUseCase(this.db, this.conn);
        this.loadOsmLayerUseCase = new LoadOsmLayerUseCase(this.db, this.conn);
        this.loadGeojsonUseCase = new LoadGeojsonUseCase(this.db, this.conn);
        this.loadGeoTiffUseCase = new LoadGeoTiffUseCase(this.db, this.conn);

        this.polygonizeOsmSurfaceUseCase = new PolygonizeOsmSurfaceUseCase(this.db, this.conn);

        this.spatialJoinUseCase = new SpatialJoinUseCase(this.conn);
        this.buildHeatmapUseCase = new BuildHeatmapUseCase(this.conn);

        this.getLayerBboxUseCase = new GetLayerBboxUseCase(this.conn);
        this.getLayerUseCase = new GetLayerUseCase(this.conn);
        this.getRasterUseCase = new GetRasterUseCase(this.conn);
        this.getOsmBboxUseCase = new GetOsmBboxUseCase(this.conn);
        this.getTableUseCase = new GetTableUseCase(this.conn);

        this.updateTableUseCase = new UpdateTableUseCase(this.db, this.conn);
        this.dropTableUseCase = new DropTableUseCase(this.conn);

        this.rawQueryUseCase = new RawQueryUseCase(this.conn);
    }

    /**
     * Switches to a workspace, creating its schema and cache entry if needed.
     *
     * Updates both the active DuckDB schema and the in-memory workspace registry used by this instance.
     *
     * @param name - The name of the workspace to activate.
     * @returns Resolves when the workspace has been created if necessary and set as active.
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
                workspaceCropLayer: null,
            });
        }

        await this.conn.query(`USE ${name}`);
        this.currentWorkspace = name;
    }

    /**
     * Returns the names of all workspaces known to this instance.
     *
     * Uses the in-memory workspace registry rather than discovering schemas from DuckDB.
     *
     * @returns Array of registered workspace names.
     * @throws Never throws.
     * @example
     * const names = db.getWorkspaces();
     * console.log(names); // ['autk', 'analysis-a']
     */
    getWorkspaces(): string[] {
        return Array.from(this.workspaces.keys());
    }

    /**
     * Returns the name of the workspace currently selected for operations.
     *
     * This value changes when `setWorkspace()` succeeds.
     *
     * @returns Current workspace name.
     * @throws Never throws.
     * @example
     * console.log(db.getCurrentWorkspace()); // 'autk'
     */
    getCurrentWorkspace(): string {
        return this.currentWorkspace;
    }

    /**
     * Loads OpenStreetMap data from the Overpass API or a PBF file and extracts thematic layers.
     *
     * `autoLoadLayers` is required. The raw OSM import tables are treated as temporary
     * staging tables and are always dropped after the requested layers are extracted.
     * The surface layer is polygonized and other layers are clipped to its geometry.
     *
     * @param params - Area query, optional output table name, and required layer extraction settings.
     * @returns Timing breakdown for OSM download and layer extraction.
     * @throws If the database is not initialized.
     * @example
     * const timings = await db.loadOsm({
     *   queryArea: { geocodeArea: 'New York', areas: ['Manhattan Island'] },
     *   autoLoadLayers: {
     *     layers: ['buildings', 'roads', 'surface'],
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
            !this.getOsmBboxUseCase ||
            !this.polygonizeOsmSurfaceUseCase
        )
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        if (workspaceData.tables.some((table) => table.source !== 'osm')) {
            const message = 'OpenStreetMap data must be loaded before non-OSM layers so it can establish the workspace context.';
            console.error(message);
            throw new Error(message);
        }

        const targetCrs = workspaceData.coordinateFormat;
        const sourceCrs = params.autoLoadLayers.coordinateFormat ?? DEFAULT_INPUT_COORDINATE_FORMAT;
        const outputTableName = params.outputTableName ?? 'table_osm';

        const loadParams = { ...params, outputTableName, workspace: this.currentWorkspace };
        const execResult = params.pbfFileUrl
            ? await this.loadOsmFromPbfUseCase.exec(loadParams)
            : await this.loadOsmFromOverpassApiUseCase.exec(loadParams);
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

        const boundaryTableName = `${outputTableName}_boundaries`;
        const osmBoundingBox = await this.getOsmBboxUseCase.exec({
            osmTableName: boundaryTableName,
            workspace: this.currentWorkspace,
            coordinateFormat: targetCrs,
        });
        if (!workspaceData.workspaceBoundingBox) {
            workspaceData.workspaceBoundingBox = osmBoundingBox;
        }

        let surfaceLayerName: string | null = null;
        const clippableLayerNames: string[] = [];

        for (const layer of params.autoLoadLayers.layers) {
            const shouldCropToBbox = layer !== 'buildings';

            const layerParams: LoadOsmLayerParams = {
                osmInputTableName: outputTableName,
                coordinateFormat: sourceCrs,
                layer,
            };

            layerParams.boundingBox = shouldCropToBbox ? osmBoundingBox : undefined;

            const t0 = performance.now();
            const layerTable = await this.loadOsmLayer({ ...layerParams, workspaceCoordinateFormat: targetCrs });
            const loadMs = performance.now() - t0;

            const countResult = await this.conn.query(
                `SELECT COUNT(*) as cnt FROM ${this.currentWorkspace}.${layerTable.name}`
            );
            const featureCount = Number(countResult.toArray()[0].cnt);

            timings.layers.push({ layerName: layerTable.name, layerType: layer, loadMs, featureCount });

            if (layer === 'surface') {
                const updatedTable = await this.polygonizeOsmSurfaceUseCase.exec(
                    { surfaceTableName: layerTable.name, workspace: this.currentWorkspace },
                    layerTable
                );
                const tableIndex = workspaceData.tables.findIndex((t) => t.name === layerTable.name);
                if (tableIndex !== -1) workspaceData.tables[tableIndex] = updatedTable;
                await this.refreshStoredBoundingBox(layerTable.name);
                workspaceData.workspaceCropLayer = layerTable.name;
                surfaceLayerName = layerTable.name;
            } else {
                clippableLayerNames.push(layerTable.name);
            }
        }

        if (surfaceLayerName && clippableLayerNames.length > 0) {
            for (const layerName of clippableLayerNames) {
                const cropGeometry = !layerName.endsWith('_buildings');
                await this.clipLayerToLayer(layerName, surfaceLayerName, this.currentWorkspace, cropGeometry);
                await this.refreshStoredBoundingBox(layerName);
            }
        }

        for (const table of execResult.tables) {
            await this.dropTableUseCase.exec({ tableName: table.name, workspace: this.currentWorkspace });
            workspaceData.tables = workspaceData.tables.filter((t) => t.name !== table.name);
        }

        console.log(`OSM data loaded and completed in workspace '${this.currentWorkspace}'!`);

        return timings;
    }

    /**
     * Loads a CSV file into the database, optionally creating geometry from coordinate or WKT columns.
     *
     * Supports the default `Latitude` / `Longitude` shorthand, custom lat/lng column names, or a single WKT geometry column.
     *
     * @param params - File URL or array, table name, and optional geometry column mapping.
     * @returns The created CSV table metadata.
     * @throws If the database is not initialized, both `csvFileUrl` and `csvObject` are provided, geometry creation fails, or WKT geometry families are mixed.
     * @example
     * const table = await db.loadCsv({
     *   csvFileUrl: '/data/stations.csv',
     *   outputTableName: 'stations',
     *   geometryColumns: true,
     * });
     */
    async loadCsv(params: LoadCsvParams): Promise<CsvTable> {
        if (!this.db || !this.conn || !this.loadCsvUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const hasWorkspaceContext = Boolean(workspaceData.workspaceBoundingBox);
        const table = await this.loadCsvUseCase.exec({
            ...params,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: workspaceData.coordinateFormat,
        });
        this.registerTable(table);
        if (hasWorkspaceContext) {
            await this.applyWorkspaceConstraints(table.name);
        }

        return this.initializeSpatialMetadata(table);
    }

    /**
     * Loads a JSON array into the database, optionally creating geometry from coordinate or WKT fields.
     *
     * Supports the default `Latitude` / `Longitude` shorthand, custom lat/lng field names, or a single WKT geometry field.
     *
     * @param params - File URL or array, table name, and optional geometry field mapping.
     * @returns The created JSON table metadata, including a renderable `type` when geometry is materialized.
     * @throws If the database is not initialized, both `jsonFileUrl` and `jsonObject` are provided, or geometry creation fails.
     * @example
     * const table = await db.loadJson({
     *   jsonFileUrl: '/data/events.json',
     *   outputTableName: 'events',
     *   geometryColumns: { wktColumnName: 'wkt' },
     * });
     */
    async loadJson(params: LoadJsonParams): Promise<JsonTable> {
        if (!this.db || !this.conn || !this.loadJsonUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const hasWorkspaceContext = Boolean(workspaceData.workspaceBoundingBox);
        const table = await this.loadJsonUseCase.exec({
            ...params,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: workspaceData.coordinateFormat,
        });
        this.registerTable(table);
        if (hasWorkspaceContext) {
            await this.applyWorkspaceConstraints(table.name);
        }

        return this.initializeSpatialMetadata(table);
    }

    /**
     * Extracts a thematic layer (roads, buildings, parks, water, surface) from a loaded raw OSM table.
     *
     * Internal helper used by `loadOsm()`.
     *
     * @param params - OSM table name, layer type, and optional bounding box for cropping.
     * @returns The created layer table metadata.
     * @throws If the database is not initialized, the OSM table is missing, or the table is not a raw OSM table.
     */
    private async loadOsmLayer(params: LoadOsmLayerParams & { workspaceCoordinateFormat?: string }): Promise<OsmLayerTable> {
        if (!this.db || !this.conn || !this.loadOsmLayerUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const osmTable = this.getTablesMetadata().find((t) => t.name === params.osmInputTableName);
        if (!osmTable) throw new Error(`Table ${params.osmInputTableName} not found.`);
        if (!(osmTable.source === 'osm' && osmTable.type === undefined))
            throw new Error(`Table ${params.osmInputTableName} is not a raw OSM table.`);

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.loadOsmLayerUseCase.exec({
            ...params,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: params.workspaceCoordinateFormat ?? workspaceData.coordinateFormat,
        });
        this.registerTable(table);

        return this.initializeSpatialMetadata(table);
    }

    /**
     * Loads a GeoJSON FeatureCollection as a spatial layer, optionally auto-clipping to the workspace bbox when OSM data is present.
     *
     * When `layerType` is `'buildings'`, computes `building_id` by clustering overlapping geometries.
     *
     * @param params - File URL or object, table name, and layer type.
     * @returns The created custom layer table metadata.
     * @throws If the database is not initialized, or the GeoJSON is not a FeatureCollection.
     * @example
     * const neighborhoods = await db.loadGeojson({
     *   geojsonFileUrl: '/data/neighborhoods.geojson',
     *   outputTableName: 'neighborhoods',
     *   layerType: 'parks',
     * });
     */
    async loadGeojson(params: LoadGeojsonParams): Promise<GeojsonTable> {
        if (
            !this.db ||
            !this.conn ||
            !this.loadGeojsonUseCase ||
            !this.getLayerBboxUseCase
        )
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const hasWorkspaceContext = Boolean(workspaceData.workspaceBoundingBox);
        const table = await this.loadGeojsonUseCase.exec({
            ...params,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: workspaceData.coordinateFormat,
        });
        this.registerTable(table);
        if (hasWorkspaceContext) {
            await this.applyWorkspaceConstraints(table.name);
        }

        const tableWithSpatialMetadata = await this.initializeSpatialMetadata(table);

        if (params.layerType === 'buildings') {
            const qualifiedTableName = `${this.currentWorkspace}.${tableWithSpatialMetadata.name}`;
            const hasBuildingId = tableWithSpatialMetadata.columns.some((column) => column.name === 'building_id');
            if (!hasBuildingId) {
                await this.conn.query(`ALTER TABLE ${qualifiedTableName} ADD COLUMN building_id BIGINT`);
            }
            await this.conn.query(`UPDATE ${qualifiedTableName} SET building_id = CAST(id AS BIGINT)`);

            const describeUpdatedTableResponse = await this.conn.query(`DESCRIBE ${qualifiedTableName}`);
            tableWithSpatialMetadata.columns = getColumnsFromDuckDbTableDescribe(describeUpdatedTableResponse.toArray());
        }

        return tableWithSpatialMetadata;
    }

    /**
     * Loads a GeoTIFF raster as a compact raster table with metadata and flat in-memory band arrays.
     *
     * Large rasters are downsampled when needed so browser memory use stays bounded.
     *
     * @param params - File URL or ArrayBuffer, table name, and optional CRS override.
     * @returns The created GeoTIFF table metadata.
     * @throws If the database is not initialized or if the input sources are invalid.
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
        const hasWorkspaceContext = Boolean(workspaceData.workspaceBoundingBox);
        const table = await this.loadGeoTiffUseCase.exec({
            ...params,
            workspace: this.currentWorkspace,
            workspaceCoordinateFormat: workspaceData.coordinateFormat,
        });
        this.registerTable(table);
        if (hasWorkspaceContext) {
            await this.applyWorkspaceConstraints(table.name);
        }

        return this.initializeSpatialMetadata(table);
    }

    /**
     * Exports a compact raster table as a packed raster FeatureCollection for rendering.
     *
     * This applies to GeoTIFF rasters and compact heatmap rasters.
     * The returned feature contains flat band arrays (`band_1`, `band_2`, ...) and raster resolution metadata.
     * Pass one of the band ids as the raster property selector in `AutkMap.loadCollection()`.
     *
     * @param tableName - Name of the compact raster table.
     * @returns A FeatureCollection with a single feature containing flat band arrays and resolution metadata.
     * @throws If the database is not initialized, the table is missing, or it is not a compact raster table.
     * @example
     * const fc = await db.getRaster('temperature');
     * map.loadCollection('temperature', {
     *   collection: fc,
     *   type: 'raster',
     *   property: 'band_1',
     * });
     */
    async getRaster(tableName: string): Promise<FeatureCollection<null>> {
        if (!this.db || !this.conn || !this.getRasterUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const table = this.getTablesMetadata().find((t) => t.name === tableName);
        if (!table || !isRasterTable(table))
            throw new Error(`Table ${tableName} is not a compact raster table.`);

        return this.getRasterUseCase.exec(tableName, this.currentWorkspace);
    }

    /**
     * Exports a loaded layer as a GeoJSON FeatureCollection with an automatically computed bounding box.
     *
     * The bbox is resolved from the immutable workspace bounds, then the layer's own bounds.
     *
     * @param layerTableName - Name of the layer table to export.
     * @returns A FeatureCollection with a `bbox` property.
     * @throws If the database is not initialized, the table is missing, or it is not a layer table.
     * @example
     * const buildings = await db.getLayer('osm_buildings');
     * map.loadCollection('buildings', { collection: buildings, type: 'buildings' });
     */
    async getLayer(layerTableName: string): Promise<FeatureCollection> {
        if (!this.db || !this.conn || !this.getLayerUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const layerTable = this.getTablesMetadata().find((t) => t.name === layerTableName);
        if (!layerTable) throw new Error(`Table ${layerTableName} not found.`);
        if (!isRenderableTable(layerTable)) throw new Error(`Table ${layerTableName} is not a renderable layer.`);

        const featureCollection = layerTable.type === 'raster' && !this.tableHasGeometry(layerTable)
            ? await this.getRaster(layerTableName) as unknown as FeatureCollection
            : await this.getLayerUseCase.exec(layerTable, this.currentWorkspace);

        const workspaceData = this.getCurrentWorkspaceData();
        if (workspaceData.workspaceBoundingBox) {
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
        if (!this.db || !this.conn || !this.getLayerBboxUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const layerTable = this.getTablesMetadata().find((t) => t.name === layerName);
        if (!layerTable) throw new Error(`Table ${layerName} not found.`);

        const hasGeometry = layerTable.columns.find((column) => column.type === 'GEOMETRY');
        if (!hasGeometry) {
            throw new Error(
                `Table ${layerName} does not have a geometry column. This method only works with layer tables that contain geometries.`,
            );
        }

        if (layerTable.boundingBox) {
            return layerTable.boundingBox;
        }

        const boundingBox = await this.getLayerBboxUseCase.exec({
            layerTableName: layerName,
            workspace: this.currentWorkspace,
        });
        layerTable.boundingBox = boundingBox;
        return boundingBox;
    }

    /**
     * Returns metadata for all vector layers in the current workspace.
     *
     * @returns Filtered array of vector layer metadata.
     * @throws If the active workspace is missing from the internal registry.
     * @example
     * const layers = db.getLayersMetadata();
     * for (const l of layers) await map.loadCollection(l.name, { collection: await db.getLayer(l.name), type: l.type });
     */
    getLayersMetadata(): Array<Table & { type: Exclude<LayerType, 'raster'> }> {
        return this.getTablesMetadata().filter((table): table is Table & { type: Exclude<LayerType, 'raster'> } => {
            return isVectorTable(table);
        });
    }

    /**
     * Returns metadata for all raster tables in the current workspace.
     *
     * @returns Filtered array of raster table metadata.
     * @throws If the active workspace is missing from the internal registry.
     */
    getRastersMetadata(): Array<Table & { type: 'raster' }> {
        return this.getTablesMetadata().filter((table): table is Table & { type: 'raster' } => {
            return isRasterTable(table);
        });
    }

    /**
     * Reads all rows from a table as plain JavaScript objects.
     *
     * @param tableName - Table name.
     * @returns Array of plain objects where each object represents one row.
     * @throws If the database is not initialized or the table is not found.
     * @example
     * const rows = await db.getTable('stations');
     * console.log(rows[0]);
     */
    async getTable(tableName: string): Promise<GetTableOutput> {
        if (!this.db || !this.conn || !this.getTableUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const table = this.getTablesMetadata().find((t) => t.name === tableName);
        if (!table) throw new Error(`Table ${tableName} not found.`);

        return this.getTableUseCase.exec(tableName, this.currentWorkspace);
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

        const table = this.getTablesMetadata().find((t) => t.name === params.tableName);
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

        return this.refreshStoredBoundingBox(params.tableName);
    }

    /**
     * Performs a spatial join between two tables using predicates like INTERSECT or NEAR.
     *
     * The join always modifies the root table in place using a LEFT join.
     *
     * @param params - Root and join table names, spatial predicate, optional near distance, and optional grouping.
     * @returns The updated root table.
     * @throws If the database is not initialized.
     * @example
     * await db.spatialQuery({
     *   tableRootName: 'roads',
     *   tableJoinName: 'lst',
     *   near: { distance: 1000 },
     * });
     */
    async spatialQuery(params: SpatialQueryParams): Promise<Table> {
        if (!this.db || !this.conn || !this.spatialJoinUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.spatialJoinUseCase.exec(params, workspaceData.tables, this.currentWorkspace);
        workspaceData.tables = workspaceData.tables.map((t) => (t.name === table.name ? table : t));

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

        if (params.output?.type === 'CREATE_TABLE') {
            this.registerTable(result as Table);
            return this.initializeSpatialMetadata(result as Table);
        }

        return result as unknown as T;
    }

    /**
     * Drops a table from DuckDB and unregisters it from the active workspace.
     *
     * Keeps the in-memory workspace registry aligned with the physical schema after a table is removed.
     *
     * @param tableName - Name of the table to remove.
     * @returns Resolves when the table has been dropped and unregistered.
     * @throws If the database is not initialized.
     * @example
     * await db.removeLayer('osm_raw');
     */
    async removeLayer(tableName: string): Promise<void> {
        if (!this.conn || !this.dropTableUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        await this.dropTableUseCase.exec({ tableName, workspace: this.currentWorkspace });

        const workspaceData = this.getCurrentWorkspaceData();
        const droppedTable = workspaceData.tables.find((t) => t.name === tableName);
        if (droppedTable && isRasterTable(droppedTable) && !this.tableHasGeometry(droppedTable)) {
            deleteRasterPayload(this.currentWorkspace, tableName);
        }
        workspaceData.tables = workspaceData.tables.filter((t) => t.name !== tableName);
        if (workspaceData.workspaceCropLayer === tableName) {
            workspaceData.workspaceCropLayer = null;
        }
    }

    /**
     * Builds a heatmap table by creating a grid internally and aggregating source values into its cells.
     *
     * Uses the cached workspace bounding box as the grid extent, runs a NEAR spatial aggregation into the generated grid, then rewrites the result as raster-band properties.
     *
     * @param params - Source table, NEAR settings, grid configuration, and aggregation method.
     * @returns The resulting heatmap table metadata.
     * @throws If the database is not initialized, if the workspace has no bounding box, or if the source table is missing.
     * @example
     * const heatmap = await db.buildHeatmap({
     *   tableJoinName: 'incidents',
     *   near: { distance: 500 },
     *   outputTableName: 'heatmap_result',
     *   grid: { rows: 50, columns: 50 },
     *   groupBy: [{ column: '*', aggregateFn: 'count' }],
     * });
     */
    async buildHeatmap(params: BuildHeatmapParams): Promise<Table> {
        if (!this.db || !this.conn || !this.buildHeatmapUseCase)
            throw new Error('Database not initialized. Please call init() first.');

        const workspaceData = this.getCurrentWorkspaceData();
        const table = await this.buildHeatmapUseCase.exec(params, workspaceData.tables, workspaceData.workspaceBoundingBox, this.currentWorkspace);
        this.registerTable(table);

        return this.refreshStoredBoundingBox(table.name);
    }

    // ---- Private methods

    /**
     * Retrieves the cached metadata for the active workspace.
     *
     * Centralizes access to workspace-local tables, CRS settings, and cached extents.
     *
     * @returns The workspace data object for `currentWorkspace`.
     * @throws If the current workspace does not exist in the internal map.
     * @example
     * const data = this.getCurrentWorkspaceData();
     * console.log(data.coordinateFormat);
     */
    private getCurrentWorkspaceData(): WorkspaceData {
        const data = this.workspaces.get(this.currentWorkspace);
        if (!data) {
            throw new Error(`Workspace '${this.currentWorkspace}' not found. This should not happen.`);
        }
        return data;
    }

    /**
     * Returns whether the table currently stores geometry data.
     */
    private tableHasGeometry(table: Table): boolean {
        return table.columns.some((column) => column.type === 'GEOMETRY');
    }

    /**
     * Returns whether the table should define the workspace crop layer.
     */
    private isPolygonalTable(table: Table): boolean {
        return table.type === 'surface'
            || table.type === 'parks'
            || table.type === 'water'
            || table.type === 'buildings'
            || table.type === 'polygons';
    }

    /**
     * Returns whether clipping should crop geometry or only filter rows.
     */
    private shouldCropGeometry(table: Table): boolean {
        return table.type !== 'points' && table.type !== 'buildings' && table.type !== 'raster';
    }

    /**
     * Applies the current workspace bounding-box filter and optional crop layer to a loaded table.
     */
    private async applyWorkspaceConstraints(tableName: string): Promise<void> {
        const workspaceData = this.getCurrentWorkspaceData();
        const table = workspaceData.tables.find((item) => item.name === tableName);
        if (!table || !this.tableHasGeometry(table) || !workspaceData.workspaceBoundingBox) return;

        await this.clipLayerToBoundingBox(
            tableName,
            workspaceData.workspaceBoundingBox,
            this.currentWorkspace,
        );

        if (workspaceData.workspaceCropLayer && workspaceData.workspaceCropLayer !== tableName) {
            await this.clipLayerToLayer(
                tableName,
                workspaceData.workspaceCropLayer,
                this.currentWorkspace,
                this.shouldCropGeometry(table),
            );
        }
    }

    /**
     * Computes and stores the bounding box for a geometry-bearing table.
     */
    private async refreshStoredBoundingBox(tableName: string): Promise<Table> {
        if (!this.getLayerBboxUseCase) {
            throw new Error('Database not initialized. Please call init() first.');
        }

        const workspaceData = this.getCurrentWorkspaceData();
        const table = workspaceData.tables.find((item) => item.name === tableName);
        if (!table) throw new Error(`Table ${tableName} not found.`);
        if (!this.tableHasGeometry(table)) return table;

        table.boundingBox = await this.getLayerBboxUseCase.exec({
            layerTableName: tableName,
            workspace: this.currentWorkspace,
        });

        return table;
    }

    /**
     * Initializes immutable workspace bounds from the first geometry-bearing table and stores the table bbox.
     */
    private async initializeSpatialMetadata<T extends Table>(table: T): Promise<T> {
        if (!this.tableHasGeometry(table)) return table;

        const tableWithBoundingBox = await this.refreshStoredBoundingBox(table.name) as T;
        const workspaceData = this.getCurrentWorkspaceData();
        if (!workspaceData.workspaceBoundingBox) {
            workspaceData.workspaceBoundingBox = tableWithBoundingBox.boundingBox;
            if (this.isPolygonalTable(tableWithBoundingBox)) {
                workspaceData.workspaceCropLayer = tableWithBoundingBox.name;
            }
        }

        return tableWithBoundingBox;
    }

    /**
     * Registers table metadata in the active workspace.
     *
     * Replaces any existing entry with the same name and logs a warning when an overwrite occurs.
     *
     * @param table - The table metadata to register.
     * @returns Nothing.
     * @throws If the active workspace is missing from the internal registry.
     * @example
     * this.registerTable(table);
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
     * Filters a layer table to the current workspace bounding box in place.
     */
    private async clipLayerToBoundingBox(
        layerTableName: string,
        boundingBox: BoundingBox,
        workspace: string,
    ): Promise<void> {
        const qualifiedLayer = `${workspace}.${layerTableName}`;
        const envelope = `ST_MakeEnvelope(${boundingBox.minLon}, ${boundingBox.minLat}, ${boundingBox.maxLon}, ${boundingBox.maxLat})`;

        await this.conn!.query(`
      DELETE FROM ${qualifiedLayer}
      WHERE NOT ST_Intersects(geometry, ${envelope});
    `);
    }

    /**
     * Filters or crops a layer table to the geometry of another layer.
     */
    private async clipLayerToLayer(
        layerTableName: string,
        cropLayerName: string,
        workspace: string,
        cropGeometry: boolean = true,
    ): Promise<void> {
        const qualifiedLayer = `${workspace}.${layerTableName}`;
        const qualifiedCropLayer = `${workspace}.${cropLayerName}`;

        if (!cropGeometry) {
            await this.conn!.query(`
      DELETE FROM ${qualifiedLayer} AS l
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${qualifiedCropLayer} crop
        WHERE ST_Intersects(l.geometry, ST_MakeValid(crop.geometry))
      );
    `);
            return;
        }

        await this.conn!.query(`
      DELETE FROM ${qualifiedLayer} AS l
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${qualifiedCropLayer} crop
        WHERE ST_Intersects(l.geometry, ST_MakeValid(crop.geometry))
      );
    `);

        await this.conn!.query(`
      UPDATE ${qualifiedLayer} AS l
      SET geometry = ST_Intersection(ST_MakeValid(l.geometry), crop.geom)
      FROM (
        SELECT ST_Union_Agg(ST_MakeValid(geometry)) AS geom FROM ${qualifiedCropLayer}
      ) crop
      WHERE ST_Intersects(l.geometry, crop.geom);
    `);

        await this.conn!.query(`
      DELETE FROM ${qualifiedLayer}
      WHERE ST_IsEmpty(geometry);
    `);
    }
}
