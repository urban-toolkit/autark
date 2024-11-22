import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { OsmTable } from '../../shared/interfaces';
import { Params } from './interfaces';
import { LOAD_PBF_ON_TABLE_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescription } from '../../shared/utils';

export class LoadPbfUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec({ pbfFileUrl, tableName, boudingBox }: Params): Promise<OsmTable> {
    const loadPbfQuery = LOAD_PBF_ON_TABLE_QUERY(pbfFileUrl, tableName, boudingBox);
    const response = await this.conn.query(loadPbfQuery);

    return {
      type: 'osm',
      name: tableName,
      columns: getColumnsFromDuckDbTableDescription(response.toArray()),
    };
  }
}
