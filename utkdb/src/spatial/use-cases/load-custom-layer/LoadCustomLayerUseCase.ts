import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { CustomLayerTable } from '../../../shared/interfaces';
import { Params } from './interfaces';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';
import { LOAD_FEATURE_COLLECTION_QUERY, LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { FeatureCollection } from 'geojson';

export class LoadCustomLayerUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  async exec({
    geojsonFileUrl,
    geojsonObject,
    outputTableName,
    coordinateFormat = DEFALT_COORDINATE_FORMAT,
  }: Params): Promise<CustomLayerTable> {
    if (!geojsonFileUrl && !geojsonObject) {
      throw new Error('Either geojsonFileUrl or geojsonObject must be provided');
    }
    if (geojsonFileUrl && geojsonObject) {
      throw new Error('Cannot provide both geojsonFileUrl and geojsonObject. Please provide only one.');
    }

    let geojson: FeatureCollection;

    if (geojsonFileUrl) {
      const response = await fetch(geojsonFileUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! Error to load ${geojsonFileUrl}! Status: ${response.status}`);
      }
      geojson = await response.json();
    } else {
      geojson = geojsonObject!;
    }

    if (geojson.type !== 'FeatureCollection') {
      throw new Error(`Invalid GeoJSON type! Just accepting FeatureCollection for now!`);
    }

    const describeTableResponse = await this.createTableFromFeatureCollection(
      geojson,
      outputTableName,
      coordinateFormat,
    );

    return {
      source: 'geojson',
      type: 'custom2DLayer',
      columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
      name: outputTableName,
    };
  }

  private async createTableFromFeatureCollection(
    geojson: FeatureCollection,
    outputTableName: string,
    coordinateFormat: string,
  ) {
    // Create temporary file with GeoJSON data
    const fileName = `temp_geojson_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;

    // Register the GeoJSON as a temporary file in DuckDB
    await this.db.registerFileText(fileName, JSON.stringify(geojson));

    // Create feature collection table from the temporary file
    const featureCollectionQuery = LOAD_FEATURE_COLLECTION_QUERY(fileName, `${outputTableName}_feature_collection`);
    await this.conn.query(featureCollectionQuery);

    // Create the final layer table
    const queryLayer = LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY(
      `${outputTableName}_feature_collection`,
      outputTableName,
      coordinateFormat,
    );

    await this.db.dropFile(fileName);

    return await this.conn.query(queryLayer);
  }
}
