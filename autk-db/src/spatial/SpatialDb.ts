 
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { CsvTable, CustomLayerTable, LayerTable, JsonTable, Table } from '../shared/interfaces';
import { loadDb } from '../config/duckdb';
import { LoadLayerUseCase, GetLayerParams } from './use-cases/load-layer';
import { LoadCsvUseCase, LoadCsvParams } from './use-cases/load-csv';
import { LoadJsonUseCase, LoadJsonParams } from './use-cases/load-json';
import { GetLayerGeojsonUseCase } from './use-cases/get-layer-geojson';
import { FeatureCollection } from 'geojson';
import { LoadCustomLayerParams, LoadCustomLayerUseCase } from './use-cases/load-custom-layer';
import { SpatialQueryParams } from './use-cases/spatial-join/interfaces';
import { SpatialJoinUseCase } from './use-cases/spatial-join/SpatialJoinUseCase';
import { DropTableUseCase } from './shared/use-cases/drop-table/DropTableUseCase';
import { BoundingBox } from '../shared/interfaces';
import { TransformBoundingBoxCoordinatesUseCase } from './shared/use-cases/transform-bounding-box-coordinates/TransformBoundingBoxCoordinatesUseCase';
import { GetBoundingBoxFromLayerUseCase } from './shared/use-cases/get-bounding-box-from-layer/GetBoundingBoxFromLayerUseCase';
import { isLayerType } from './use-cases/load-layer/interfaces';
import { LoadOsmFromOverpassApiParams, LoadOsmFromOverpassApiUseCase } from './use-cases/load-osm-from-overpass-api';
import type { OsmLoadTimings } from './use-cases/load-osm-from-overpass-api/interfaces';
import { LoadGridLayerParams, LoadGridLayerUseCase } from './use-cases/load-grid-layer/LoadGridLayerUseCase';
import { GridLayerTable, GeoTiffTable } from '../shared/interfaces';
import { LoadGeoTiffUseCase, LoadGeoTiffParams } from './use-cases/load-geotiff';
import { RawQueryOutput, RawQueryParams } from './use-cases/raw-query/interfaces';
import { RawQueryUseCase } from './use-cases/raw-query';
import { GetBoundingBoxFromOsmUseCase } from './shared/use-cases/get-bounding-box-from-osm/GetBoundingBoxFromOsmUseCase';
import { PolygonizeSurfaceLayerUseCase } from './use-cases/polygonize-surface-layer';
import { BuildHeatmapParams, BuildHeatmapUseCase } from './use-cases/build-heatmap';
import { GetTableDataParams, GetTableDataOutput, GetTableDataUseCase } from './use-cases/get-table-data';
import { UpdateTableUseCase, UpdateTableParams } from './use-cases/update-table';
import { toPlain } from './shared/utils';

interface WorkspaceData {
  tables: Array<Table>;
  osmBoudingBox?: BoundingBox;
  osmBoudingBoxWgs84?: BoundingBox;
}

/**
 * SpatialDb class provides methods to interact with a DuckDB database for spatial data operations.
 *
 * It allows loading OSM data, CSV, JSON, custom layers, and grid layers,
 * as well as performing spatial joins and raw queries.
 * It also provides methods to retrieve layer data and bounding boxes.
 * 
 * Supports multiple isolated workspaces, each with its own schema and data.
 */
export class AutkSpatialDb {
  private db?: AsyncDuckDB;
  private conn?: AsyncDuckDBConnection;
  private currentWorkspace: string = 'main';
  private workspaces: Map<string, WorkspaceData> = new Map();
  
  public get tables(): Array<Table> {
    return this.getCurrentWorkspaceData().tables;
  }
  
  private loadOsmFromOverpassApiUseCase?: LoadOsmFromOverpassApiUseCase;
  private loadCsvUseCase?: LoadCsvUseCase;
  private loadLayerUseCase?: LoadLayerUseCase;
  private loadCustomLayerUseCase?: LoadCustomLayerUseCase;
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
   * Gets the workspace data for the current workspace.
   * @returns The WorkspaceData for the current workspace.
   * @private
   */
  private getCurrentWorkspaceData(): WorkspaceData {
    const data = this.workspaces.get(this.currentWorkspace);
    if (!data) {
      throw new Error(`Workspace '${this.currentWorkspace}' not found. This should not happen.`);
    }
    return data;
  }

  /**
   * Initializes the SpatialDb instance by loading the DuckDB database and setting up use cases.
   * @returns A promise that resolves when initialization is complete.
   */
  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    // Install and load spatial extension
    await this.conn.query('INSTALL spatial; LOAD spatial;');

    // Create main schema and initialize default workspace
    await this.conn.query('CREATE SCHEMA IF NOT EXISTS main');
    this.workspaces.set('main', {
      tables: [],
      osmBoudingBox: undefined,
    });

    this.loadOsmFromOverpassApiUseCase = new LoadOsmFromOverpassApiUseCase(this.db, this.conn);
    this.loadCsvUseCase = new LoadCsvUseCase(this.db, this.conn);
    this.loadJsonUseCase = new LoadJsonUseCase(this.db, this.conn);
    this.loadLayerUseCase = new LoadLayerUseCase(this.db, this.conn);
    this.loadCustomLayerUseCase = new LoadCustomLayerUseCase(this.db, this.conn);
    this.getLayerGeojsonUseCase = new GetLayerGeojsonUseCase(this.conn);
    this.spatialJoinUseCase = new SpatialJoinUseCase(this.conn);
    this.getBoundingBoxFromLayerUseCase = new GetBoundingBoxFromLayerUseCase(this.conn);
    this.dropTableUseCase = new DropTableUseCase(this.conn);
    this.transformBoundingBoxCoordinatesUseCase = new TransformBoundingBoxCoordinatesUseCase(this.conn);
    this.loadGridLayerUseCase = new LoadGridLayerUseCase(this.conn);
    this.loadGeoTiffUseCase = new LoadGeoTiffUseCase(this.db, this.conn);
    this.rawQueryUseCase = new RawQueryUseCase(this.conn);
    this.getBoundingBoxFromOsmUseCase = new GetBoundingBoxFromOsmUseCase(this.conn);
    this.polygonizeSurfaceLayerUseCase = new PolygonizeSurfaceLayerUseCase(this.db, this.conn);
    this.buildHeatmapUseCase = new BuildHeatmapUseCase(this.conn);
    this.getTableDataUseCase = new GetTableDataUseCase(this.conn);
    this.updateTableUseCase = new UpdateTableUseCase(this.db, this.conn);
  }

  /**
   * Sets the current workspace. If the workspace doesn't exist, it will be created.
   * @param name - The name of the workspace to switch to.
   * @returns A promise that resolves when the workspace is set.
   */
  async setWorkspace(name: string): Promise<void> {
    if (!this.conn) {
      throw new Error('Database not initialized. Please call init() first.');
    }

    if (!this.workspaces.has(name)) {
      await this.conn.query(`CREATE SCHEMA IF NOT EXISTS ${name}`);
      this.workspaces.set(name, {
        tables: [],
        osmBoudingBox: undefined,
      });
    }

    this.currentWorkspace = name;
  }

  /**
   * Gets the list of all available workspaces.
   * @returns An array of workspace names.
   */
  getWorkspaces(): string[] {
    return Array.from(this.workspaces.keys());
  }

  /**
   * Gets the name of the current active workspace.
   * @returns The current workspace name.
   */
  getCurrentWorkspace(): string {
    return this.currentWorkspace;
  }

  /**
   * Registers a table in the current workspace's tables array. If a table with the same name already exists,
   * it will be replaced and a warning will be logged to the console.
   * @param table - The table to register.
   */
  private _registerTable(table: Table): void {
    const workspaceData = this.getCurrentWorkspaceData();
    const existingIndex = workspaceData.tables.findIndex((t) => t.name === table.name);
    
    if (existingIndex !== -1) {
      console.warn(`Table '${table.name}' already exists in workspace '${this.currentWorkspace}'. Overwriting...`);
      workspaceData.tables[existingIndex] = table;
    } else {
      workspaceData.tables.push(table);
    }
  }

  // ---- LOAD's methods

  /**
   * Loads OSM data from the Overpass API and optionally loads layers based on the provided parameters.
   * When autoLoadLayers is enabled, this method will automatically extract and process specific layers
   * (e.g., buildings, roads, surface) from the OSM data, and optionally polygonize the surface layer.
   *
   * @param params - Parameters for loading OSM data and layers.
   * @returns A promise that resolves when the OSM data and layers are fully loaded.
   * @throws Error if the database or connection is not initialized.
   */
  async loadOsm(params: LoadOsmFromOverpassApiParams): Promise<OsmLoadTimings> {
    if (
      !this.db ||
      !this.conn ||
      !this.loadOsmFromOverpassApiUseCase ||
      !this.dropTableUseCase ||
      !this.getBoundingBoxFromOsmUseCase ||
      !this.transformBoundingBoxCoordinatesUseCase ||
      !this.polygonizeSurfaceLayerUseCase
    )
      throw new Error('Database not initialized. Please call init() first.');

    const execResult = await this.loadOsmFromOverpassApiUseCase.exec({ ...params, workspace: this.currentWorkspace });
    for (const table of execResult.tables) {
      this._registerTable(table);
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

      const workspaceData = this.getCurrentWorkspaceData();
      workspaceData.osmBoudingBoxWgs84 = rawBoundingBox;
      workspaceData.osmBoudingBox = await this.transformBoundingBoxCoordinatesUseCase.exec({
        boundingBox: rawBoundingBox,
        coordinateFormat: params.autoLoadLayers.coordinateFormat,
      });

      for (const layer of params.autoLoadLayers.layers) {
        const shouldCrop = layer !== 'buildings'; // avoid crop buildings layer

        const layerParams: GetLayerParams = {
          osmInputTableName: params.outputTableName,
          coordinateFormat: params.autoLoadLayers.coordinateFormat,
          layer,
        };

        layerParams.boundingBox = shouldCrop ? workspaceData.osmBoudingBox : undefined;

        const t0 = performance.now();
        const layerTable = await this.loadLayer(layerParams);
        const loadMs = performance.now() - t0;

        const countResult = await this.conn.query(
          `SELECT COUNT(*) as cnt FROM ${this.currentWorkspace}.${layerTable.name}`
        );
        const featureCount = Number(countResult.toArray()[0].cnt);

        timings.layers.push({ layerName: layerTable.name, layerType: layer, loadMs, featureCount });

        // Polygonize surface layer
        if (layer === 'surface') {
          const updatedTable = await this.polygonizeSurfaceLayerUseCase.exec(
            { surfaceTableName: layerTable.name, workspace: this.currentWorkspace },
            layerTable
          );
          const tableIndex = workspaceData.tables.findIndex((t) => t.name === layerTable.name);
          if (tableIndex !== -1) workspaceData.tables[tableIndex] = updatedTable;
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
   * Loads a CSV file into the database and returns the created CsvTable.
   * @param params - Parameters for loading the CSV file, including file path and table name.
   * @returns A promise that resolves to the created CsvTable.
   * @throws Error if the database or connection is not initialized.
   */
  async loadCsv(params: LoadCsvParams): Promise<CsvTable> {
    if (!this.db || !this.conn || !this.loadCsvUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadCsvUseCase.exec({ ...params, workspace: this.currentWorkspace });
    this._registerTable(table);

    return table;
  }

  /**
   * Loads a JSON file into the database and returns the created JsonTable.
   * @param params - Parameters for loading the JSON file, including file path and table name.
   * @returns A promise that resolves to the created JsonTable.
   * @throws Error if the database or connection is not initialized.
   */
  async loadJson(params: LoadJsonParams): Promise<JsonTable> {
    if (!this.db || !this.conn || !this.loadJsonUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadJsonUseCase.exec({ ...params, workspace: this.currentWorkspace });
    this._registerTable(table);

    return table;
  }

  /**
   * Loads a layer from an OSM input table and returns the created LayerTable.
   * @param params - Parameters for loading the layer.
   * @returns A promise that resolves to the created LayerTable.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the OSM input table is not found or is not of the correct type.
   */
  async loadLayer(params: GetLayerParams): Promise<LayerTable> {
    if (!this.db || !this.conn || !this.loadLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const osmTable = this.tables.find((t) => t.name === params.osmInputTableName);
    if (!osmTable) throw new Error(`Table ${params.osmInputTableName} not found.`);
    if (!(osmTable.source === 'osm' && osmTable.type === 'pointset'))
      throw new Error(`Table ${params.osmInputTableName} is not an OSM table.`);

    const table = await this.loadLayerUseCase.exec({ ...params, workspace: this.currentWorkspace });
    this._registerTable(table);

    return table;
  }

  /**
   * Loads a custom layer from a GeoJSON file and returns the created CustomLayerTable.
   * If OSM bounding box is available, it will be automatically applied to crop the layer.
   * @param params - Parameters for loading the custom layer, including file path, table name, and layer type.
   * @returns A promise that resolves to the created CustomLayerTable.
   * @throws Error if the database or connection is not initialized.
   */
  async loadCustomLayer(params: LoadCustomLayerParams): Promise<CustomLayerTable> {
    if (!this.db || !this.conn || !this.loadCustomLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.loadCustomLayerUseCase.exec({ 
      ...params, 
      boundingBox: workspaceData.osmBoudingBox,
      workspace: this.currentWorkspace 
    });
    this._registerTable(table);

    return table;
  }

  /**
   * Loads a grid layer and returns the created GridLayerTable.
   * If no bounding box is provided in params, the OSM bounding box will be used if available.
   * @param params - Parameters for loading the grid layer, including grid size, cell size, and optional bounding box.
   * @returns A promise that resolves to the created GridLayerTable.
   * @throws Error if the database or connection is not initialized.
   */
  async loadGridLayer(params: LoadGridLayerParams): Promise<GridLayerTable> {
    if (!this.db || !this.conn || !this.loadGridLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.loadGridLayerUseCase.exec({
      ...params,
      boundingBox: params.boundingBox || workspaceData.osmBoudingBox,
      workspace: this.currentWorkspace
    });
    this._registerTable(table);

    return table;
  }

  /**
   * Loads a GeoTIFF raster file into the database.
   * Uses DuckDB's spatial extension (GDAL-backed ST_Read) to parse the file.
   * The resulting table has a `geometry` column (cell centroids) and a
   * `properties` struct column containing one field per raster band.
   * @param params - Parameters including the file URL or ArrayBuffer, output table name,
   *   and optional coordinate transformation settings.
   * @returns A promise that resolves to the created GeoTiffTable.
   */
  async loadGeoTiff(params: LoadGeoTiffParams): Promise<GeoTiffTable> {
    if (!this.db || !this.conn || !this.loadGeoTiffUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadGeoTiffUseCase.exec({
      ...params,
      workspace: this.currentWorkspace,
    });
    this._registerTable(table);

    return table;
  }

  /**
   * Retrieves a loaded GeoTIFF table as a FeatureCollection suitable for rendering with autk-map.
   *
   * The returned collection has a single feature whose `properties.raster` is an array of per-pixel
   * property objects (one per cell, in row-major top-to-bottom order), plus `rasterResX` / `rasterResY`
   * dimensions and a `bbox`.
   *
   * Pass the result directly to `AutkMap.loadRasterCollection()` and supply a `property` callback that
   * extracts the numeric band value you want to visualise, e.g. `(cell) => cell.band_1 ?? 0`.
   *
   * @param tableName - The name of the GeoTiff table (as given to `loadGeoTiff`).
   * @returns A promise that resolves to a packed raster FeatureCollection.
   */
  async getGeoTiffLayer(tableName: string): Promise<FeatureCollection<null>> {
    if (!this.db || !this.conn)
      throw new Error('Database not initialized. Please call init() first.');

    const table = this.tables.find((t) => t.name === tableName);
    if (!table || table.source !== 'geotiff')
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

    // Expand bbox by half a pixel on each side so single-column/row rasters don't collapse to zero width/height.
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

  // GETTER'S

  /**
   * Retrieves the GeoJSON representation of a layer by its table name.
   * The returned FeatureCollection will include a bbox property with the layer's bounding box.
   * @param layerTableName - The name of the layer table to retrieve.
   * @returns A promise that resolves to the GeoJSON FeatureCollection of the layer with bbox.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the layer table is not found or is not a Layer table.
   */
  async getLayer(layerTableName: string): Promise<FeatureCollection> {
    if (!this.db || !this.conn || !this.getLayerGeojsonUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const layerTable = this.tables.find((t) => t.name === layerTableName);
    if (!layerTable) throw new Error(`Table ${layerTableName} not found.`);
    if (!isLayerType(layerTable.type)) throw new Error(`Table ${layerTableName} is not a Layer table.`);

    const featureCollection = await this.getLayerGeojsonUseCase.exec(layerTable as LayerTable | CustomLayerTable, this.currentWorkspace);

    const osmBoundingBox = this.getOsmBoundingBox();
    if (osmBoundingBox) {
      featureCollection.bbox = osmBoundingBox;
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
   * Retrieves the bounding box of the OSM data loaded from the Overpass API for the current workspace.
   * @returns The bounding box as a tuple [minLon, minLat, maxLon, maxLat], or null if no OSM data has been loaded.
   */
  getOsmBoundingBox(): [number, number, number, number] | null {
    const workspaceData = this.getCurrentWorkspaceData();
    if (!workspaceData.osmBoudingBox) return null;

    return [
      workspaceData.osmBoudingBox.minLon,
      workspaceData.osmBoudingBox.minLat,
      workspaceData.osmBoudingBox.maxLon,
      workspaceData.osmBoudingBox.maxLat,
    ]
  }

  /**
   * Returns the OSM bounding box in WGS84 (EPSG:4326) as loaded from the Overpass API.
   * Useful for clipping raster files (e.g. GeoTIFF) that are stored in EPSG:4326.
   * @returns The bounding box or null if no OSM data has been loaded.
   */
  getOsmBoundingBoxWgs84(): BoundingBox | null {
    return this.getCurrentWorkspaceData().osmBoudingBoxWgs84 ?? null;
  }

  /**
   * Retrieves the bounding box of a layer by its table name.
   * @param layerName - The name of the layer table to retrieve the bounding box from.
   * @returns A promise that resolves to the bounding box of the layer.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the layer table is not found.
   * @throws Error if the layer table does not have a geometry column.
   */
  async getBoundingBoxFromLayer(layerName: string): Promise<BoundingBox> {
    if (!this.db || !this.conn || !this.getBoundingBoxFromLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const layerTable = this.tables.find((t) => t.name === layerName);
    if (!layerTable) throw new Error(`Table ${layerName} not found.`);

    // Verify the table has a geometry column
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
   * Retrieves all layer tables (LayerTable and CustomLayerTable) from the loaded tables.
   * @returns An array of LayerTable and CustomLayerTable objects.
   */
  getLayerTables(): Array<LayerTable | CustomLayerTable> {
    return this.tables.filter((table): table is LayerTable | CustomLayerTable => {
      return (
        (table.source === 'osm' && isLayerType(table.type)) ||
        (table.source === 'geojson' && isLayerType(table.type)) ||
        (table.source === 'user' && isLayerType(table.type)) // TODO: check if this is correct
      );
    });
  }

  /**
   * Retrieves the data from any table as an array of plain JavaScript objects.
   * This method works with all table types (CSV, JSON, Layer, Grid, etc.).
   * @param params - Parameters including table name and optional pagination (limit, offset).
   * @returns A promise that resolves to an array of objects representing the table rows.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the table is not found.
   */
  async getTableData(params: GetTableDataParams): Promise<GetTableDataOutput> {
    if (!this.db || !this.conn || !this.getTableDataUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = this.tables.find((t) => t.name === params.tableName);
    if (!table) throw new Error(`Table ${params.tableName} not found.`);

    return this.getTableDataUseCase.exec({ ...params, workspace: this.currentWorkspace });
  }

  // ---- UPDATE methods

  /**
   * Updates an existing table with new data.
   * 
   * For layer tables (OSM, GeoJSON), the input data should be a GeoJSON FeatureCollection.
   * For non-layer tables (CSV, JSON), the input data should be an array of objects.
   * 
   * @param params - Parameters for updating the table:
   *   - tableName: The name of the table to update
   *   - data: The new data (FeatureCollection for layers, Record<string, unknown>[] for CSV/JSON)
   *   - strategy: 'replace' (drop and recreate) or 'update' (update existing records by ID)
   *   - idColumn: Required for 'update' strategy. Supports 'id' or 'properties.attribute_name' format
   * @returns A promise that resolves to the updated Table with refreshed column metadata.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the table is not found.
   * @throws Error if idColumn is not provided when using 'update' strategy.
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

    // Update the table in the workspace
    const workspaceData = this.getCurrentWorkspaceData();
    const tableIndex = workspaceData.tables.findIndex((t) => t.name === params.tableName);
    if (tableIndex !== -1) {
      workspaceData.tables[tableIndex] = result.table;
    }

    return result.table;
  }

  // CUSTOM QUERIES

  /**
   * Performs a spatial join between two tables and returns the resulting table.
   * The method can either create a new table or update an existing one based on the parameters.
   * @param params - Parameters for the spatial join operation, including source and target tables, join type, and output table name.
   * @returns A promise that resolves to the resulting table after the spatial join.
   * @throws Error if the database or connection is not initialized.
   */
  async spatialQuery(params: SpatialQueryParams): Promise<Table> {
    if (!this.db || !this.conn || !this.spatialJoinUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const { created, table } = await this.spatialJoinUseCase.exec(params, workspaceData.tables);
    if (created) this._registerTable(table);
    else workspaceData.tables = workspaceData.tables.map((t) => (t.name === table.name ? table : t));

    return table;
  }

  /**
   * Executes a raw SQL query and returns the result.
   * @param params - Parameters for the raw query, including the SQL query string and output type.
   * @returns A promise that resolves to a Table if output type is 'CREATE_TABLE', otherwise returns the query result of type T.
   * @throws Error if the database or connection is not initialized.
   */
  async rawQuery<T = RawQueryOutput>(params: RawQueryParams): Promise<T | Table> {
    if (!this.db || !this.conn || !this.rawQueryUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const result = await this.rawQueryUseCase.exec(params);

    if (params.output.type === 'CREATE_TABLE') {
      this._registerTable(result as Table);
      return result as Table;
    }

    return result as unknown as T;
  }

  /**
   * Drops a table from the database and removes it from the current workspace.
   * @param tableName - The name of the table to remove.
   * @returns A promise that resolves when the table has been dropped.
   * @throws Error if the database or connection is not initialized.
   */
  async removeLayer(tableName: string): Promise<void> {
    if (!this.conn || !this.dropTableUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    await this.dropTableUseCase.exec({ tableName, workspace: this.currentWorkspace });

    const workspaceData = this.getCurrentWorkspaceData();
    workspaceData.tables = workspaceData.tables.filter((t) => t.name !== tableName);
  }

  /**
   * Builds a heatmap from spatial data by creating a grid and aggregating values.
   * The heatmap is generated by creating a grid over the bounding box and aggregating values from the source table into each grid cell.
   * @param params - Parameters for building the heatmap, including source table, grid configuration, and aggregation method.
   * @returns A promise that resolves to the resulting GridLayerTable containing the heatmap data.
   * @throws Error if the database or connection is not initialized.
   */
  async buildHeatmap(params: BuildHeatmapParams): Promise<Table> {
    if (!this.db || !this.conn || !this.buildHeatmapUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const workspaceData = this.getCurrentWorkspaceData();
    const table = await this.buildHeatmapUseCase.exec(params, workspaceData.tables, workspaceData.osmBoudingBox);
    this._registerTable(table);

    return table;
  }
}
