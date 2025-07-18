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

  /**
   * Initializes the SpatialDb instance by loading the DuckDB database and setting up use cases.
   */
  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    this.loadOsmFromOverpassApiUseCase = new LoadOsmFromOverpassApiUseCase(this.db, this.conn);
    this.loadCsvUseCase = new LoadCsvUseCase(this.db, this.conn);
    this.loadJsonUseCase = new LoadJsonUseCase(this.db, this.conn);
    this.loadLayerUseCase = new LoadLayerUseCase(this.conn);
    this.loadCustomLayerUseCase = new LoadCustomLayerUseCase(this.db, this.conn);
    this.getLayerGeojsonUseCase = new GetLayerGeojsonUseCase(this.conn);
    this.spatialJoinUseCase = new SpatialJoinUseCase(this.conn);
    this.getBoundingBoxFromLayerUseCase = new GetBoundingBoxFromLayerUseCase(this.conn);
    this.dropTableUseCase = new DropTableUseCase(this.conn);
    this.transformBoundingBoxCoordinatesUseCase = new TransformBoundingBoxCoordinatesUseCase(this.conn);
    this.loadGridLayerUseCase = new LoadGridLayerUseCase(this.conn);
    this.rawQueryUseCase = new RawQueryUseCase(this.conn);
    this.getBoundingBoxFromOsmUseCase = new GetBoundingBoxFromOsmUseCase(this.conn);

    this.conn.query('INSTALL spatial; LOAD spatial;');
  }

  // ---- LOAD's methods

  /**
   * Loads OSM data from the Overpass API and optionally loads layers based on the provided parameters.
   *
   * @param params - Parameters for loading OSM data and layers.
   * @returns A promise that resolves when the OSM data is loaded.
   * @throws Error if the database or connection is not initialized, or if required parameters are missing.
   * @throws Error if both boundingBox and polygon are provided, or if neither is provided.
   * @throws Error if the OSM table is not found or is not of the correct type.
   */
  async loadOsmFromOverpassApi(params: LoadOsmFromOverpassApiParams): Promise<void> {
    if (
      !this.db ||
      !this.conn ||
      !this.loadOsmFromOverpassApiUseCase ||
      !this.dropTableUseCase ||
      !this.getBoundingBoxFromOsmUseCase ||
      !this.transformBoundingBoxCoordinatesUseCase
    )
      throw new Error('Database not initialized. Please call init() first.');

    const tables = await this.loadOsmFromOverpassApiUseCase.exec(params);
    for (const table of tables) {
      this.tables.push(table);
    }

    if (params.autoLoadLayers) {
      const boundaryTableName = `${params.outputTableName}_boundaries`;
      const rawBoundingBox = await this.getBoundingBoxFromOsmUseCase.exec({ osmTableName: boundaryTableName });

      console.log({ rawBoundingBox });
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
        await this.loadLayer(layerParams);
      }

      if (params.autoLoadLayers.dropOsmTable) {
        for (const table of tables) {
          await this.dropTableUseCase.exec({ tableName: table.name });
          this.tables = this.tables.filter((t) => t.name !== table.name);
        }
      }
    }
  }

  /**
   * Loads a CSV file into the database and returns the created CsvTable.
   * @param params - Parameters for loading the CSV file.
   * @returns A promise that resolves to the created CsvTable.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the loadCsvUseCase is not available.
   * @throws Error if the CSV file cannot be loaded.
   */
  async loadCsv(params: LoadCsvParams): Promise<CsvTable> {
    if (!this.db || !this.conn || !this.loadCsvUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadCsvUseCase.exec(params);
    this.tables.push(table);

    return table;
  }

  /**
   * Loads a JSON file into the database and returns the created JsonTable.
   * @param params - Parameters for loading the JSON file.
   * @returns A promise that resolves to the created JsonTable.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the loadJsonUseCase is not available.
   * @throws Error if the JSON file cannot be loaded.
   */
  async loadJson(params: LoadJsonParams): Promise<JsonTable> {
    if (!this.db || !this.conn || !this.loadJsonUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadJsonUseCase.exec(params);
    this.tables.push(table);

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
    this.tables.push(table);

    return table;
  }

  /**
   * Loads a custom layer from a GeoJSON file and returns the created CustomLayerTable.
   * @param params - Parameters for loading the custom layer.
   * @returns A promise that resolves to the created CustomLayerTable.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the loadCustomLayerUseCase is not available.
   * @throws Error if the GeoJSON file cannot be loaded.
   */
  async loadCustomLayer(params: LoadCustomLayerParams): Promise<CustomLayerTable> {
    if (!this.db || !this.conn || !this.loadCustomLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadCustomLayerUseCase.exec({ ...params, boundingBox: this.osmBoudingBox });
    this.tables.push(table);

    return table;
  }

  /**
   * Loads a grid layer and returns the created GridLayerTable.
   * @param params - Parameters for loading the grid layer.
   * @returns A promise that resolves to the created GridLayerTable.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the loadGridLayerUseCase is not available.
   */
  async loadGridLayer(params: LoadGridLayerParams): Promise<GridLayerTable> {
    if (!this.db || !this.conn || !this.loadGridLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadGridLayerUseCase.exec(params);
    this.tables.push(table);

    return table;
  }

  // GETTER'S

  /**
   * Retrieves the GeoJSON representation of a layer by its table name.
   * @param layerTableName - The name of the layer table to retrieve.
   * @returns A promise that resolves to the GeoJSON FeatureCollection of the layer.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the layer table is not found or is not a Layer table.
   */
  async getLayer(layerTableName: string): Promise<FeatureCollection> {
    if (!this.db || !this.conn || !this.getLayerGeojsonUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const layerTable = this.tables.find((t) => t.name === layerTableName);
    if (!layerTable) throw new Error(`Table ${layerTableName} not found.`);
    if (!isLayerType(layerTable.type)) throw new Error(`Table ${layerTableName} is not a Layer table.`);

    return this.getLayerGeojsonUseCase.exec(layerTable as LayerTable | CustomLayerTable);
  }

  /**
   * Retrieves the bounding box of the OSM data loaded from the Overpass API.
   * @returns The bounding box of the OSM data.
   * @throws Error if the OSM bounding box is not found.
   */
  getOsmBoundingBox(): BoundingBox {
    if (!this.osmBoudingBox) throw new Error('OSM bounding box not found. Please call loadOsmFromOverpassApi() first.');
    return this.osmBoudingBox;
  }

  /**
   * Retrieves the bounding box of a layer by its table name.
   * @param layerName - The name of the layer table to retrieve the bounding box from.
   * @returns A promise that resolves to the bounding box of the layer.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the layer table is not found or is not a Layer table.
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

  // CUSTOM QUERIES

  /**
   * Performs a spatial join between two tables and returns the resulting table.
   * @param params - Parameters for the spatial join operation.
   * @returns A promise that resolves to the resulting table after the spatial join.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the spatialJoinUseCase is not available.
   */
  async spatialJoin(params: SpatialJoinParams): Promise<Table> {
    if (!this.db || !this.conn || !this.spatialJoinUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const { created, table } = await this.spatialJoinUseCase.exec(params, this.tables);
    if (created) this.tables.push(table);
    else this.tables = this.tables.map((t) => (t.name === table.name ? table : t));

    return table;
  }

  /**
   * Executes a raw SQL query and returns the result.
   * @param params - Parameters for the raw query.
   * @returns A promise that resolves to the result of the raw query.
   * @throws Error if the database or connection is not initialized.
   * @throws Error if the rawQueryUseCase is not available.
   */
  async rawQuery<T = RawQueryOutput>(params: RawQueryParams): Promise<T | Table> {
    if (!this.db || !this.conn || !this.rawQueryUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const result = await this.rawQueryUseCase.exec(params);

    if (params.output.type === 'CREATE_TABLE') {
      this.tables.push(result as Table);
      return result as Table;
    }

    return result as unknown as T;
  }
}
