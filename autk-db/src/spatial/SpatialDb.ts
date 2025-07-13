/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { CsvTable, CustomLayerTable, LayerTable, Table } from '../shared/interfaces';
import { loadDb } from '../config/duckdb';
import { LoadLayerUseCase, GetLayerParams } from './use-cases/load-layer';
import { LoadCsvUseCase, LoadCsvParams } from './use-cases/load-csv';
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
import { getBoundingBoxFromPolygon } from './shared/utils';
import { LoadGridLayerParams, LoadGridLayerUseCase } from './use-cases/load-grid-layer/LoadGridLayerUseCase';
import { GridLayerTable } from '../shared/interfaces';
import { RawQueryOutput, RawQueryParams } from './use-cases/raw-query/interfaces';
import { RawQueryUseCase } from './use-cases/raw-query';

export class SpatialDb {
  private db?: AsyncDuckDB;
  private conn?: AsyncDuckDBConnection;
  public tables: Array<Table> = [];
  private osmBoudingBox?: BoundingBox;
  private loadOsmFromOverpassApiUseCase?: LoadOsmFromOverpassApiUseCase;
  private loadCsvUseCase?: LoadCsvUseCase;
  private loadLayerUseCase?: LoadLayerUseCase;
  private loadCustomLayerUseCase?: LoadCustomLayerUseCase;
  private getLayerGeojsonUseCase?: GetLayerGeojsonUseCase;
  private spatialJoinUseCase?: SpatialJoinUseCase;
  private getBoundingBoxFromLayerUseCase?: GetBoundingBoxFromLayerUseCase;
  private dropTableUseCase?: DropTableUseCase;
  private transformBoundingBoxCoordinatesUseCase?: TransformBoundingBoxCoordinatesUseCase;
  private loadGridLayerUseCase?: LoadGridLayerUseCase;
  private rawQueryUseCase?: RawQueryUseCase;

  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    this.loadOsmFromOverpassApiUseCase = new LoadOsmFromOverpassApiUseCase(this.db, this.conn);
    this.loadCsvUseCase = new LoadCsvUseCase(this.db, this.conn);
    this.loadLayerUseCase = new LoadLayerUseCase(this.conn);
    this.loadCustomLayerUseCase = new LoadCustomLayerUseCase(this.db, this.conn);
    this.getLayerGeojsonUseCase = new GetLayerGeojsonUseCase(this.conn);
    this.spatialJoinUseCase = new SpatialJoinUseCase(this.conn);
    this.getBoundingBoxFromLayerUseCase = new GetBoundingBoxFromLayerUseCase(this.conn);
    this.dropTableUseCase = new DropTableUseCase(this.conn);
    this.transformBoundingBoxCoordinatesUseCase = new TransformBoundingBoxCoordinatesUseCase(this.conn);
    this.loadGridLayerUseCase = new LoadGridLayerUseCase(this.conn);
    this.rawQueryUseCase = new RawQueryUseCase(this.conn);
    this.conn.query('INSTALL spatial; LOAD spatial;');
  }

  // LOAD's methods
  async loadOsmFromOverpassApi(params: LoadOsmFromOverpassApiParams): Promise<void> {
    if (
      !this.db ||
      !this.conn ||
      !this.loadOsmFromOverpassApiUseCase ||
      !this.dropTableUseCase ||
      !this.transformBoundingBoxCoordinatesUseCase
    )
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadOsmFromOverpassApiUseCase.exec(params);
    this.tables.push(table);

    if (params.autoLoadLayers) {
      if (!params.boundingBox && !params.polygon) throw new Error('Either boundingBox or polygon must be provided');

      if (params.boundingBox && params.polygon)
        throw new Error('Either boundingBox or polygon must be provided, not both');

      if (params.boundingBox) {
        this.osmBoudingBox = await this.transformBoundingBoxCoordinatesUseCase.exec({
          boundingBox: params.boundingBox,
          coordinateFormat: params.autoLoadLayers.coordinateFormat,
        });
      } else if (params.polygon) {
        const calculatedBoundingBox = getBoundingBoxFromPolygon(params.polygon);
        this.osmBoudingBox = await this.transformBoundingBoxCoordinatesUseCase.exec({
          boundingBox: calculatedBoundingBox,
          coordinateFormat: params.autoLoadLayers.coordinateFormat,
        });
      }

      for (const layer of params.autoLoadLayers.layers) {
        const shouldCrop = layer !== 'buildings'; // avoid crop buildings layer

        const layerParams: GetLayerParams = {
          osmInputTableName: table.name,
          coordinateFormat: params.autoLoadLayers.coordinateFormat,
          layer,
        };

        if (params.boundingBox) {
          layerParams.boundingBox = shouldCrop ? this.osmBoudingBox : undefined;
        } else if (params.polygon) {
          layerParams.polygon = shouldCrop ? params.polygon : undefined;
        }

        await this.loadLayer(layerParams);
      }

      if (params.autoLoadLayers.dropOsmTable) await this.dropTableUseCase.exec({ tableName: table.name });
      this.tables = this.tables.filter((t) => t.name !== table.name);
    }
  }

  async loadCsv(params: LoadCsvParams): Promise<CsvTable> {
    if (!this.db || !this.conn || !this.loadCsvUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadCsvUseCase.exec(params);
    this.tables.push(table);

    return table;
  }

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

  async loadCustomLayer(params: LoadCustomLayerParams): Promise<CustomLayerTable> {
    if (!this.db || !this.conn || !this.loadCustomLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadCustomLayerUseCase.exec({ ...params, boundingBox: this.osmBoudingBox });
    this.tables.push(table);

    return table;
  }

  async loadGridLayer(params: LoadGridLayerParams): Promise<GridLayerTable> {
    if (!this.db || !this.conn || !this.loadGridLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadGridLayerUseCase.exec(params);
    this.tables.push(table);

    return table;
  }

  // GETTER'S
  async getLayer(layerTableName: string): Promise<FeatureCollection> {
    if (!this.db || !this.conn || !this.getLayerGeojsonUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const layerTable = this.tables.find((t) => t.name === layerTableName);
    if (!layerTable) throw new Error(`Table ${layerTableName} not found.`);
    if (!isLayerType(layerTable.type)) throw new Error(`Table ${layerTableName} is not a Layer table.`);

    return this.getLayerGeojsonUseCase.exec(layerTable as LayerTable | CustomLayerTable);
  }

  getOsmBoundingBox(): BoundingBox {
    if (!this.osmBoudingBox) throw new Error('OSM bounding box not found. Please call loadOsmFromOverpassApi() first.');
    return this.osmBoudingBox;
  }

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
  async spatialJoin(params: SpatialJoinParams): Promise<Table> {
    if (!this.db || !this.conn || !this.spatialJoinUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const { created, table } = await this.spatialJoinUseCase.exec(params, this.tables);
    if (created) this.tables.push(table);
    else this.tables = this.tables.map((t) => (t.name === table.name ? table : t));

    return table;
  }

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
