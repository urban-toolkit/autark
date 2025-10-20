import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { CustomLayerTable } from '../../../shared/interfaces';
import { Params } from './interfaces';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';
import { LOAD_FEATURE_COLLECTION_QUERY, LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { FeatureCollection } from 'geojson';
import { BoundingBox } from '../../../shared/interfaces';
import { mapGeojsonGeometryTypeToLayerType } from '../load-layer/interfaces';

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
    boundingBox,
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

    // Extract geometry type from the first feature
    if (!geojson.features || geojson.features.length === 0) {
      throw new Error('FeatureCollection is empty - no features found');
    }

    const firstFeature = geojson.features[0];
    if (!firstFeature.geometry || !firstFeature.geometry.type) {
      throw new Error('First feature has no geometry or geometry type');
    }

    const geometryType = mapGeojsonGeometryTypeToLayerType(firstFeature.geometry.type);

    const describeTableResponse = await this.createTableFromFeatureCollection(
      geojson,
      outputTableName,
      coordinateFormat,
      boundingBox,
    );

    return {
      source: 'geojson',
      type: geometryType,
      columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
      name: outputTableName,
    };
  }

  private async createTableFromFeatureCollection(
    geojson: FeatureCollection,
    outputTableName: string,
    coordinateFormat: string,
    boundingBox?: BoundingBox,
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
      boundingBox,
    );

    await this.db.dropFile(fileName);

    return await this.conn.query(queryLayer);
  }
}
