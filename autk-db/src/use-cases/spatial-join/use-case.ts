import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { SpatialQueryParams } from './interfaces';
import { Table, WorkspaceConfiguration } from '../../interfaces';
import { RasterSpatialJoinUseCase } from './raster';
import { GeometryColumnNotFoundError, TableNotFoundError } from './errors';
import { SPATIAL_JOIN_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';

/** Joins stored features, preserving original multipart geometry and root identity. */
export class SpatialJoinUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  /**
   * Updates each root feature's properties with spatial matches or aggregations.
   * Multipart geometry is evaluated directly; one stored join feature contributes once.
   * Without groupBy, matches are stored as an array under properties.sjoin.matches.
   */
  async exec(params: SpatialQueryParams, tables: Table[], workspace: string,
    configuration: Partial<WorkspaceConfiguration> = {}): Promise<Table> {
    const tableRoot = tables.find(table => table.name === params.tableRootName);
    if (!tableRoot) throw new TableNotFoundError(params.tableRootName);
    const tableJoin = tables.find(table => table.name === params.tableJoinName);
    if (!tableJoin) throw new TableNotFoundError(params.tableJoinName);
    const geometricColumnRoot = tableRoot.columns.find(column => column.type === 'GEOMETRY')?.name;
    if (!geometricColumnRoot) {
      if (tableRoot.type === 'raster') throw new Error('spatialQuery requires a vector root; compact rasters are supported as tableJoinName.');
      throw new GeometryColumnNotFoundError(tableRoot.name);
    }
    const geometricColumnJoin = tableJoin.columns.find(column => column.type === 'GEOMETRY')?.name;
    if (!geometricColumnJoin && tableJoin.type === 'raster') {
      return new RasterSpatialJoinUseCase(this.conn).exec(params, tableRoot, tableJoin, workspace, configuration);
    }
    if (!geometricColumnJoin) throw new GeometryColumnNotFoundError(tableJoin.name);

    const query = SPATIAL_JOIN_QUERY({
      workspace,
      tableRoot,
      tableJoin,
      geometricColumnRoot,
      geometricColumnJoin,
      spatialPredicate: params.near ? 'NEAR' : 'INTERSECT',
      groupBy: params.groupBy?.length ? params.groupBy : null,
      nearDistance: params.near?.distance,
      nearUseCentroid: params.near?.useCentroid ?? true,
    });
    const result = await this.conn.query(`
      CREATE OR REPLACE TABLE ${workspace}.${tableRoot.name} AS ${query}
      DESCRIBE ${workspace}.${tableRoot.name};
    `);
    return {
      ...tableRoot,
      columns: getColumnsFromDuckDbTableDescribe(result.toArray()),
    };
  }
}
