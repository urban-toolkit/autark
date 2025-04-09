import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { CustomLayerTable } from '../../../shared/interfaces';
import { Params } from './interfaces';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';
import { LOAD_FEATURE_COLLECTION_QUERY, LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

export class LoadCustomLayerUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec({
    geojsonFileUrl,
    outputTableName,
    coordinateFormat = DEFALT_COORDINATE_FORMAT,
  }: Params): Promise<CustomLayerTable> {
    const response = await fetch(geojsonFileUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! Error to load ${geojsonFileUrl}! Status: ${response.status}`);
    }

    const geojson = await response.json();
    if (geojson.type === 'FeatureCollection') {
      const describeTableResponse = await this.createTableFromFeatureCollection(
        geojsonFileUrl,
        outputTableName,
        coordinateFormat,
      );

      return {
        source: 'geojson',
        type: 'custom2DLayer',
        columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
        name: outputTableName,
      };
    } else {
      throw new Error(`Invalid GeoJSON type! Just accepting FeatureCollection for now!`);
    }
  }

  private async createTableFromFeatureCollection(
    geojsonFileUrl: string,
    outputTableName: string,
    coordinateFormat: string,
  ) {
    const featureCollectionQuery = LOAD_FEATURE_COLLECTION_QUERY(
      geojsonFileUrl,
      `${outputTableName}_feature_collection`,
    );
    const describeTableResponse = await this.conn.query(featureCollectionQuery);
    const featureCollectionColumns = getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray());

    const queryLayer = LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY(
      `${outputTableName}_feature_collection`,
      outputTableName,
      featureCollectionColumns,
      coordinateFormat,
    );
    return await this.conn.query(queryLayer);
  }
}
