import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params } from './interfaces';
import { JsonTable } from '../../../shared/interfaces';
import { LOAD_JSON_ON_TABLE_QUERY, LOAD_JSON_ON_TABLE_WITH_COORDINATES_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';

export class LoadJsonUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  async exec({ jsonFileUrl, jsonObject, outputTableName, geometryColumns, workspace = 'main' }: Params): Promise<JsonTable> {
    if (!jsonFileUrl && !jsonObject) {
      throw new Error('Either jsonFileUrl or jsonObject must be provided');
    }
    if (jsonFileUrl && jsonObject) {
      throw new Error('Cannot provide both jsonFileUrl and jsonObject. Please provide only one.');
    }

    let jsonPath = jsonFileUrl as string;
    let tempFileCreated = false;

    if (jsonObject) {
      const jsonString = JSON.stringify(jsonObject);
      jsonPath = `temp_json_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
      await this.db.registerFileText(jsonPath, jsonString);
      tempFileCreated = true;
    }

    let loadJsonQuery: string;
    if (geometryColumns) {
      loadJsonQuery = LOAD_JSON_ON_TABLE_WITH_COORDINATES_QUERY({
        jsonFileUrl: jsonPath,
        tableName: outputTableName,
        latColumnName: geometryColumns.latColumnName,
        longColumnName: geometryColumns.longColumnName,
        coordinateFormat: geometryColumns.coordinateFormat || DEFALT_COORDINATE_FORMAT,
        workspace,
      });
    } else {
      loadJsonQuery = LOAD_JSON_ON_TABLE_QUERY(jsonPath, outputTableName, workspace);
    }

    const describeTableResponse = await this.conn.query(loadJsonQuery);

    if (tempFileCreated) {
      await this.db.dropFile(jsonPath);
    }

    return {
      source: 'json',
      type: 'pointset',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
    };
  }
}
