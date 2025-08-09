import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params } from './interfaces';
import { LOAD_LAYER_QUERY } from './queries';
import { LayerTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';
import { AssignBuildingIdsUseCase } from '../assign-building-ids/AssignBuildingIdsUseCase';

export class LoadLayerUseCase {
  private conn: AsyncDuckDBConnection;
  private assignBuildingIdsUseCase: AssignBuildingIdsUseCase;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.conn = conn;
    this.assignBuildingIdsUseCase = new AssignBuildingIdsUseCase(db, conn);
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
    let columns = getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray());

    // Post-processing for building layers: assign persistent building_id column
    if (params.layer === 'buildings') {
      columns = await this.assignBuildingIdsUseCase.exec({ tableName: layerOutputTableName });
    }

    return {
      source: 'osm',
      type: params.layer,
      columns,
      name: layerOutputTableName,
    };
  }
}
