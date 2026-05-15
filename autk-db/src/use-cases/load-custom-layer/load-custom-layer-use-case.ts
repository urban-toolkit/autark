import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { GeojsonTable } from '../../interfaces';
import { LoadCustomLayerParams } from './interfaces';
import { DEFAULT_WORKSPACE_NAME, DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../../consts';
import { LOAD_FEATURE_COLLECTION_QUERY, LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { FeatureCollection } from 'geojson';
import { BoundingBox } from '../../interfaces';
import { mapGeometryTypeToLayerType } from 'autk-core';

/**
 * Loads a GeoJSON FeatureCollection as a spatial layer table.
 */
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
    coordinateFormat,
    boundingBox,
    workspace = DEFAULT_WORKSPACE_NAME,
    layerType,
    workspaceCoordinateFormat = DEFAULT_WORKSPACE_COORDINATE_FORMAT,
  }: LoadCustomLayerParams & { workspaceCoordinateFormat?: string }): Promise<GeojsonTable> {
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

    if (!geojson.features || geojson.features.length === 0) {
      throw new Error('FeatureCollection is empty - no features found');
    }

    const firstFeature = geojson.features[0];
    if (!firstFeature.geometry || !firstFeature.geometry.type) {
      throw new Error('First feature has no geometry or geometry type');
    }

    const geometryType = layerType ?? mapGeometryTypeToLayerType(firstFeature.geometry.type);
    const sourceCrs = coordinateFormat || DEFAULT_INPUT_COORDINATE_FORMAT;

    const describeTableResponse = await this.createTableFromFeatureCollection(
      geojson,
      outputTableName,
      sourceCrs,
      workspaceCoordinateFormat,
      workspace,
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
    sourceCrs: string,
    targetCrs: string,
    workspace: string,
    boundingBox?: BoundingBox,
  ) {
    const fileName = `temp_geojson_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;

    await this.db.registerFileText(fileName, JSON.stringify(geojson));

    const featureCollectionQuery = LOAD_FEATURE_COLLECTION_QUERY(fileName, `${outputTableName}_feature_collection`, workspace);
    await this.conn.query(featureCollectionQuery);

    const queryLayer = LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY(
      `${outputTableName}_feature_collection`,
      outputTableName,
      sourceCrs,
      targetCrs,
      workspace,
      boundingBox,
    );

    await this.db.dropFile(fileName);

    return await this.conn.query(queryLayer);
  }
}
