import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { OsmTable } from '../../../shared/interfaces';
import { Params } from './interfaces';
import { LOAD_PBF_ON_TABLE_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

export class LoadOsmFromPbfUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec({ pbfFileUrl, outputTableName }: Params): Promise<OsmTable> {
    const loadPbfQuery = LOAD_PBF_ON_TABLE_QUERY(pbfFileUrl, outputTableName);
    const tableDescribeResponse = await this.conn.query(loadPbfQuery);

    return {
      source: 'osm',
      type: 'pointset',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray()),
    };
  }
}
