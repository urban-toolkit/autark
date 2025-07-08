import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params } from './interfaces';
import { LOAD_LAYER_QUERY } from './queries';
import { LayerTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';

export class LoadLayerUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: Params): Promise<LayerTable> {
    if (!params.coordinateFormat) params.coordinateFormat = DEFALT_COORDINATE_FORMAT;

    const layerOutputTableName = params.outputTableName || `${params.osmInputTableName}_${params.layer}`;

    const layerQuery = LOAD_LAYER_QUERY({
      layer: params.layer,
      tableName: params.osmInputTableName,
      outputFormat: params.coordinateFormat,
      outputTableName: layerOutputTableName,
      boundingBox: params.boundingBox,
    });
    const describeTableResponse = await this.conn.query(layerQuery);

    return {
      source: 'osm',
      type: params.layer,
      columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
      name: layerOutputTableName,
    };
  }
}
