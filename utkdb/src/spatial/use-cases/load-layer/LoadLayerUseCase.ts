/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params, Returns, Layer } from './interfaces';
import { LOAD_LAYER_QUERY, GET_LAYER_DESCRIBE_QUERY } from './queries';
import { LayerTable } from '../../shared/interfaces';
import { getColumnsFromDuckDbTableDescription } from '../../shared/utils';

export class LoadLayerUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec(params: Params): Promise<Returns> {
    if (!params.coordinateFormat) params.coordinateFormat = 'EPSG:4326';

    const layerOutputTableName = `${params.tableName}_${params.layer}`;

    const layerQuery = LOAD_LAYER_QUERY({
      layer: params.layer,
      tableName: params.tableName,
      outputFormat: params.coordinateFormat,
      outputTableName: layerOutputTableName,
    });
    const response = await this.conn.query(layerQuery);

    return {
      layers: this.parseData(response),
      table: await this.generateLayerTableData(layerOutputTableName),
    };
  }

  private parseData(response: any): Layer[] {
    return response.toArray().map((record: any) => {
      const metadata = record.tags?.toJSON() || {};

      return {
        metadata,
        linestring: JSON.parse(record.linestring),
      };
    });
  }

  private async generateLayerTableData(layerOutputTableName: string): Promise<LayerTable> {
    const describeQuery = GET_LAYER_DESCRIBE_QUERY(layerOutputTableName);
    const response = await this.conn.query(describeQuery);

    return {
      type: 'layer',
      columns: getColumnsFromDuckDbTableDescription(response.toArray()),
      name: layerOutputTableName,
    };
  }
}
