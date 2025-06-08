/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { CsvTable, CustomLayerTable, LayerTable, Table } from '../shared/interfaces';
import { loadDb } from '../config/duckdb';
import { LoadOsmFromPbfUseCase, LoadOsmFromPbfParams } from './use-cases/load-osm-from-pbf';
import { LoadLayerUseCase, GetLayerParams } from './use-cases/load-layer';
import { LoadCsvUseCase, LoadCsvParams } from './use-cases/load-csv';
import { QueryOperation } from '../query-operation';
import { GetLayerGeojsonUseCase } from './use-cases/get-layer-geojson';
import { FeatureCollection } from 'geojson';
import { LoadQueryUseCase } from './use-cases/load-query';
import { LoadCustomLayerParams, LoadCustomLayerUseCase } from './use-cases/load-custom-layer';
import { SpatialJoinParams } from './use-cases/spatial-join/interfaces';
import { SpatialJoinUseCase } from './use-cases/spatial-join/SpatialJoinUseCase';
import { DropTableUseCase } from './shared/use-cases/drop-table/DropTableUseCase';
import { GetBoundingBoxUseCase } from './shared/use-cases/get-bounding-box/GetBoundingBoxUseCase';
import { BoundingBox } from './shared/use-cases/get-bounding-box/interfaces';
import { TransformBoundingBoxCoordinatesUseCase } from './shared/use-cases/transform-bounding-box-coordinates/TransformBoundingBoxCoordinatesUseCase';
import { isLayerType } from './use-cases/load-layer/interfaces';
import { LoadOsmFromOverpassApiParams, LoadOsmFromOverpassApiUseCase } from './use-cases/load-osm-from-overpass-api';

export class SpatialDb {
  private db?: AsyncDuckDB;
  private conn?: AsyncDuckDBConnection;
  public tables: Array<Table> = [];
  private osmBoudingBox?: BoundingBox;
  private loadOsmFromPbfUseCase?: LoadOsmFromPbfUseCase;
  private loadOsmFromOverpassApiUseCase?: LoadOsmFromOverpassApiUseCase;
  private loadCsvUseCase?: LoadCsvUseCase;
  private loadLayerUseCase?: LoadLayerUseCase;
  private loadQueryUseCase?: LoadQueryUseCase;
  private loadCustomLayerUseCase?: LoadCustomLayerUseCase;
  private getLayerGeojsonUseCase?: GetLayerGeojsonUseCase;
  private spatialJoinUseCase?: SpatialJoinUseCase;
  private getBoundingBoxUseCase?: GetBoundingBoxUseCase;
  private dropTableUseCase?: DropTableUseCase;
  private transformBoundingBoxCoordinatesUseCase?: TransformBoundingBoxCoordinatesUseCase;

  async init() {
    this.db = await loadDb();
    this.conn = await this.db.connect();

    this.loadOsmFromPbfUseCase = new LoadOsmFromPbfUseCase(this.conn);
    this.loadOsmFromOverpassApiUseCase = new LoadOsmFromOverpassApiUseCase(this.conn);
    this.loadCsvUseCase = new LoadCsvUseCase(this.conn);
    this.loadLayerUseCase = new LoadLayerUseCase(this.conn);
    this.loadQueryUseCase = new LoadQueryUseCase(this.conn);
    this.loadCustomLayerUseCase = new LoadCustomLayerUseCase(this.conn);
    this.getLayerGeojsonUseCase = new GetLayerGeojsonUseCase(this.conn);
    this.spatialJoinUseCase = new SpatialJoinUseCase(this.conn);
    this.getBoundingBoxUseCase = new GetBoundingBoxUseCase(this.conn);
    this.dropTableUseCase = new DropTableUseCase(this.conn);
    this.transformBoundingBoxCoordinatesUseCase = new TransformBoundingBoxCoordinatesUseCase(this.conn);
    this.conn.query('INSTALL spatial; LOAD spatial;');
  }

  // LOAD's methods
  async loadOsm(params: LoadOsmFromPbfParams): Promise<void> {
    if (!this.db || !this.conn || !this.loadOsmFromPbfUseCase || !this.dropTableUseCase || !this.getBoundingBoxUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadOsmFromPbfUseCase.exec(params);
    this.tables.push(table);

    if (params.autoLoadLayers) {
      for (const layer of params.autoLoadLayers.layers) {
        await this.loadLayer({
          osmInputTableName: table.name,
          coordinateFormat: params.autoLoadLayers.coordinateFormat,
          layer: layer,
        });
      }

      this.osmBoudingBox = await this.getBoundingBoxUseCase.exec({
        tableName: table.name,
        coordinateFormat: params.autoLoadLayers.coordinateFormat,
        layers: params.autoLoadLayers.layers,
      });

      if (params.autoLoadLayers.dropOsmTable) await this.dropTableUseCase.exec({ tableName: table.name });
      this.tables = this.tables.filter((t) => t.name !== table.name);
    }
  }

  async loadOsmFromOverpassApi(params: LoadOsmFromOverpassApiParams): Promise<void> {
    if (
      !this.db ||
      !this.conn ||
      !this.loadOsmFromOverpassApiUseCase ||
      !this.dropTableUseCase ||
      !this.getBoundingBoxUseCase ||
      !this.transformBoundingBoxCoordinatesUseCase
    )
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadOsmFromOverpassApiUseCase.exec(params);
    this.tables.push(table);

    if (params.autoLoadLayers) {
      for (const layer of params.autoLoadLayers.layers) {
        console.log('start loading layer', layer);
        await this.loadLayer({
          osmInputTableName: table.name,
          coordinateFormat: params.autoLoadLayers.coordinateFormat,
          layer: layer,
        });
        console.log('end loading layer', layer);
      }

      this.osmBoudingBox = await this.transformBoundingBoxCoordinatesUseCase.exec({
        boundingBox: params.boundingBox,
        coordinateFormat: params.autoLoadLayers.coordinateFormat,
      });

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

  async loadQuery(query: QueryOperation, outputTableName: string): Promise<Table> {
    if (!this.db || !this.conn || !this.loadQueryUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const querySql = query.getSql();
    const mainTable = query.getMainTable();
    if (!mainTable) throw new Error('Main table not found on query.');

    const table = await this.loadQueryUseCase.exec({ query: querySql, outputTableName, mainTable });
    this.tables.push(table);

    return table;
  }

  async loadCustomLayer(params: LoadCustomLayerParams): Promise<CustomLayerTable> {
    if (!this.db || !this.conn || !this.loadCustomLayerUseCase)
      throw new Error('Database not initialized. Please call init() first.');

    const table = await this.loadCustomLayerUseCase.exec(params);
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
    if (!this.osmBoudingBox) throw new Error('OSM bounding box not found. Please call loadOsm() first.');
    return this.osmBoudingBox;
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

  createQuery(tableName: string): QueryOperation {
    return new QueryOperation(tableName, this.tables);
  }

  applyQuery(query: QueryOperation) {
    const sql = query.getSql();
    console.log(sql);
    return this.conn?.query(sql);
  }
}
