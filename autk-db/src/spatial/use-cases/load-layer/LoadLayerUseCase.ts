import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params } from './interfaces';
import { LOAD_LAYER_QUERY } from './queries';
import { LayerTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';
import { AssignBuildingIdsUseCase } from '../assign-building-ids/AssignBuildingIdsUseCase';
import { AggregateBuildingLayerUseCase } from '../aggregate-building-layer/AggregateBuildingLayerUseCase';

export class LoadLayerUseCase {
  private conn: AsyncDuckDBConnection;
  private assignBuildingIdsUseCase: AssignBuildingIdsUseCase;
  private aggregateBuildingLayerUseCase: AggregateBuildingLayerUseCase;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.conn = conn;
    this.assignBuildingIdsUseCase = new AssignBuildingIdsUseCase(db, conn);
    this.aggregateBuildingLayerUseCase = new AggregateBuildingLayerUseCase(conn);
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

    // Post-processing for building layers: assign persistent building_id column and add aggregated geometry
    if (params.layer === 'buildings') {
      await this.assignBuildingIdsUseCase.exec({ tableName: layerOutputTableName });

      // Add aggregated geometry column to the main building table
      await this.aggregateBuildingLayerUseCase.exec({
        inputTableName: layerOutputTableName,
      });

      // Update columns to include the new agg_geometry column
      const describeUpdatedTableResponse = await this.conn.query(`DESCRIBE ${layerOutputTableName}`);
      columns = getColumnsFromDuckDbTableDescribe(describeUpdatedTableResponse.toArray());
    }

    return {
      source: 'osm_layer',
      columns,
      name: layerOutputTableName,
    };
  }
}
