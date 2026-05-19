import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { GeojsonTable } from '../../interfaces';
import { LoadGeojsonParams } from './interfaces';
import { DEFAULT_WORKSPACE_NAME, DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../../consts';
import { LOAD_FEATURE_COLLECTION_QUERY, LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { FeatureCollection } from 'geojson';
import type { BoundingBox } from '../../types-core';
import { mapGeometryTypeToLayerType } from '../../types-core';

/**
 * Loads a GeoJSON FeatureCollection as a spatial layer table.
 */
export class LoadGeojsonUseCase {
  /** DuckDB instance used for registering files and VFS operations. */
  private db: AsyncDuckDB;
  /** Active DuckDB connection used for executing queries. */
  private conn: AsyncDuckDBConnection;

  /**
   * @param db - DuckDB instance used for file registration.
   * @param conn - Active DuckDB connection for queries.
   */
  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  /**
   * Imports a GeoJSON FeatureCollection into DuckDB as a spatial layer.
   *
   * Supports loading from a URL or an in-memory object, optional CRS transformation,
   * and optional clipping by `boundingBox`.
   *
   * @param params - Load configuration including input source, output table name, and optional bounding box or layer type.
   * @returns Metadata describing the created GeoJSON table.
   * @throws Error when input is invalid, missing, or the HTTP fetch fails for a URL input.
   * @example
   * const useCase = new LoadGeojsonUseCase(db, conn);
   * const table = await useCase.exec({ geojsonFileUrl: '/tmp/fc.json', outputTableName: 'my_layer' });
   */
  async exec({
    geojsonFileUrl,
    geojsonObject,
    outputTableName,
    coordinateFormat,
    boundingBox,
    workspace = DEFAULT_WORKSPACE_NAME,
    layerType,
    workspaceCoordinateFormat = DEFAULT_WORKSPACE_COORDINATE_FORMAT,
  }: LoadGeojsonParams & { workspaceCoordinateFormat?: string }): Promise<GeojsonTable> {
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

  /**
   * Creates a DuckDB table from a GeoJSON FeatureCollection by writing a temporary
   * file to the DuckDB VFS, loading it as a feature collection, transforming, and
   * creating the final layer table.
   *
   * @param geojson - The FeatureCollection to import.
   * @param outputTableName - Name of the resulting table to create.
   * @param sourceCrs - CRS of the source features.
   * @param targetCrs - Target CRS for the workspace.
   * @param workspace - Workspace (schema) name.
   * @param boundingBox - Optional bounding box to intersect geometries.
   * @returns The DuckDB query result describing the created table.
   * @private
   */
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
