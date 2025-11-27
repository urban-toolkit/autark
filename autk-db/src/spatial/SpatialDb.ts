/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { CsvTable, CustomLayerTable, LayerTable, JsonTable, Table } from '../shared/interfaces';
import { loadDb } from '../config/duckdb';
import { LoadLayerUseCase, GetLayerParams } from './use-cases/load-layer';
import { LoadCsvUseCase, LoadCsvParams } from './use-cases/load-csv';
import { LoadJsonUseCase, LoadJsonParams } from './use-cases/load-json';
import { GetLayerGeojsonUseCase } from './use-cases/get-layer-geojson';
import { FeatureCollection } from 'geojson';
import { LoadCustomLayerParams, LoadCustomLayerUseCase } from './use-cases/load-custom-layer';
import { SpatialJoinParams } from './use-cases/spatial-join/interfaces';
import { SpatialJoinUseCase } from './use-cases/spatial-join/SpatialJoinUseCase';
import { DropTableUseCase } from './shared/use-cases/drop-table/DropTableUseCase';
import { BoundingBox } from '../shared/interfaces';
import { TransformBoundingBoxCoordinatesUseCase } from './shared/use-cases/transform-bounding-box-coordinates/TransformBoundingBoxCoordinatesUseCase';
import { GetBoundingBoxFromLayerUseCase } from './shared/use-cases/get-bounding-box-from-layer/GetBoundingBoxFromLayerUseCase';
import { isLayerType } from './use-cases/load-layer/interfaces';
import { LoadOsmFromOverpassApiParams, LoadOsmFromOverpassApiUseCase } from './use-cases/load-osm-from-overpass-api';
import { LoadGridLayerParams, LoadGridLayerUseCase } from './use-cases/load-grid-layer/LoadGridLayerUseCase';
import { GridLayerTable } from '../shared/interfaces';
import { RawQueryOutput, RawQueryParams } from './use-cases/raw-query/interfaces';
import { RawQueryUseCase } from './use-cases/raw-query';
import { GetBoundingBoxFromOsmUseCase } from './shared/use-cases/get-bounding-box-from-osm/GetBoundingBoxFromOsmUseCase';
import { PolygonizeSurfaceLayerUseCase } from './use-cases/polygonize-surface-layer';
import { BuildHeatmapParams, BuildHeatmapUseCase } from './use-cases/build-heatmap';
import { GetTableDataParams, GetTableDataOutput, GetTableDataUseCase } from './use-cases/get-table-data';

/**
 * SpatialDb class provides methods to interact with a DuckDB database for spatial data operations.
 *
 * It allows loading OSM data, CSV, JSON, custom layers, and grid layers,
 * as well as performing spatial joins and raw queries.
 * It also provides methods to retrieve layer data and bounding boxes.
 */
export class SpatialDb {
  private db?: AsyncDuckDB;
  private conn?: AsyncDuckDBConnection;
  public tables: Array<Table> = [];
  private osmBoudingBox?: BoundingBox;
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
  private rawQueryUseCase?: RawQueryUseCase;
  private getBoundingBoxFromOsmUseCase?: GetBoundingBoxFromOsmUseCase;
  private polygonizeSurfaceLayerUseCase?: PolygonizeSurfaceLayerUseCase;
  private buildHeatmapUseCase?: BuildHeatmapUseCase;
  private getTableDataUseCase?: GetTableDataUseCase;

  /**
   * Initializes the SpatialDb instance by loading the DuckDB database and setting up use cases.
   * @returns A promise that resolves when initialization is complete.
   */
  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

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
    this.rawQueryUseCase = new RawQueryUseCase(this.conn);
    this.getBoundingBoxFromOsmUseCase = new GetBoundingBoxFromOsmUseCase(this.conn);
    this.polygonizeSurfaceLayerUseCase = new PolygonizeSurfaceLayerUseCase(this.db, this.conn);
    this.buildHeatmapUseCase = new BuildHeatmapUseCase(this.conn);
    this.getTableDataUseCase = new GetTableDataUseCase(this.conn);

    this.conn.query('INSTALL spatial; LOAD spatial;');
  }

  /**
   * Registers a table in the tables array. If a table with the same name already exists,
   * it will be replaced and a warning will be logged to the console.
   * @param table - The table to register.
   */
  private _registerTable(table: Table): void {
    const existingIndex = this.tables.findIndex((t) => t.name === table.name);
    
    if (existingIndex !== -1) {
      console.warn(`Table '${table.name}' already exists. Overwriting...`);
      this.tables[existingIndex] = table;
    } else {
      this.tables.push(table);
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
  async loadOsmFromOverpassApi(params: LoadOsmFromOverpassApiParams): Promise<void> {
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

    const tables = await this.loadOsmFromOverpassApiUseCase.exec(params);
    for (const table of tables) {
      this._registerTable(table);
    }

    if (params.autoLoadLayers) {
      const boundaryTableName = `${params.outputTableName}_boundaries`;
      const rawBoundingBox = await this.getBoundingBoxFromOsmUseCase.exec({ osmTableName: boundaryTableName });

      this.osmBoudingBox = await this.transformBoundingBoxCoordinatesUseCase.exec({
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

        layerParams.boundingBox = shouldCrop ? this.osmBoudingBox : undefined;
        const layerTable = await this.loadLayer(layerParams);

        // Polygonize surface layer
        if (layer === 'surface') {
          const updatedTable = await this.polygonizeSurfaceLayerUseCase.exec(
            { surfaceTableName: layerTable.name },
            layerTable
          );
          const tableIndex = this.tables.findIndex((t) => t.name === layerTable.name);
          if (tableIndex !== -1) this.tables[tableIndex] = updatedTable;
        }
      }

      if (params.autoLoadLayers.dropOsmTable) {
        for (const table of tables) {
          await this.dropTableUseCase.exec({ tableName: table.name });
          this.tables = this.tables.filter((t) => t.name !== table.name);
        }
      }

      console.log(`OSM data loaded and completed!`);
    }
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

    const table = await this.loadCsvUseCase.exec(params);
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

    const table = await this.loadJsonUseCase.exec(params);
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

    const table = await this.loadLayerUseCase.exec(params);
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

    const table = await this.loadCustomLayerUseCase.exec({ ...params, boundingBox: this.osmBoudingBox });
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

    const table = await this.loadGridLayerUseCase.exec({ ...params, boundingBox: params.boundingBox || this.osmBoudingBox });
    this._registerTable(table);

    return table;
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

    const featureCollection = await this.getLayerGeojsonUseCase.exec(layerTable as LayerTable | CustomLayerTable);

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
   * Retrieves the bounding box of the OSM data loaded from the Overpass API.
   * @returns The bounding box as a tuple [minLon, minLat, maxLon, maxLat], or null if no OSM data has been loaded.
   */
  getOsmBoundingBox(): [number, number, number, number] | null {
    if (!this.osmBoudingBox) return null;

    return [
      this.osmBoudingBox.minLon,
      this.osmBoudingBox.minLat,
      this.osmBoudingBox.maxLon,
      this.osmBoudingBox.maxLat,
    ]
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

    return this.getTableDataUseCase.exec(params);
  }

  // CUSTOM QUERIES

  /**
   * Performs a spatial join between two tables and returns the resulting table.
   * The method can either create a new table or update an existing one based on the parameters.
   * @param params - Parameters for the spatial join operation, including source and target tables, join type, and output table name.
   * @returns A promise that resolves to the resulting table after the spatial join.
   * @throws Error if the database or connection is not initialized.
   */
  async spatialJoin(params: SpatialJoinParams): Promise<Table> {
    if (!this.db || !this.conn || !this.spatialJoinUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const { created, table } = await this.spatialJoinUseCase.exec(params, this.tables);
    if (created) this._registerTable(table);
    else this.tables = this.tables.map((t) => (t.name === table.name ? table : t));

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
   * Builds a heatmap from spatial data by creating a grid and aggregating values.
   * The heatmap is generated by creating a grid over the bounding box and aggregating values from the source table into each grid cell.
   * @param params - Parameters for building the heatmap, including source table, grid configuration, and aggregation method.
   * @returns A promise that resolves to the resulting GridLayerTable containing the heatmap data.
   * @throws Error if the database or connection is not initialized.
   */
  async buildHeatmap(params: BuildHeatmapParams): Promise<Table> {
    if (!this.db || !this.conn || !this.buildHeatmapUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.buildHeatmapUseCase.exec(params, this.tables, this.osmBoudingBox);
    this._registerTable(table);

    return table;
  }
}
