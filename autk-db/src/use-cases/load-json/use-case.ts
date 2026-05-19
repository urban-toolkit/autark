import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { JsonGeometryLayerType, LoadJsonParams } from './interfaces';
import { JsonTable } from '../../interfaces';
import { LOAD_JSON_ON_TABLE_QUERY, LOAD_JSON_ON_TABLE_WITH_COORDINATES_QUERY, LOAD_JSON_ON_TABLE_WITH_WKT_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { DEFAULT_GEO_COLUMN_NAME, DEFAULT_WORKSPACE_NAME, DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../../consts';

/**
 * Loads JSON data into a DuckDB table, optionally creating a spatial geometry column.
 *
 * Accepts data from a remote URL or an in-memory array. When `geometryColumns` is provided, point or WKT-based geometry is constructed, validated, and indexed with an R-tree.
 *
 * @note Requires an active `AsyncDuckDB` instance and connection.
 */
export class LoadJsonUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  /**
   * Creates a new instance bound to the given DuckDB connection.
   *
   * @param db - DuckDB instance used for file registration and cleanup.
   * @param conn - Open connection used to execute SQL queries.
   */
  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  /**
   * Fetches or serializes JSON data, loads it into DuckDB, and optionally creates and indexes a geometry column.
   *
   * @note Exactly one of `jsonFileUrl` or `jsonObject` must be provided.
   * @param params - configuration including data source, output table name, and optional geometry strategy.
   * @returns metadata describing the created table: source, name, columns, and geometry type.
   * @throws {Error} If neither or both data sources are provided, if required geometry column names are empty, if null geometries are produced, if WKT contains unsupported or mixed geometry types, or if the HTTP fetch fails.
   * @example
   * const useCase = new LoadJsonUseCase(db, conn);
   * const table = await useCase.exec({ jsonFileUrl: 'https://example.com/data.json', outputTableName: 'places' });
   * console.log(table.type); // undefined (no geometry)
   * @example
   * const table = await useCase.exec({ jsonObject: data, outputTableName: 'stops', geometryColumns: true });
   * console.log(table.type); // 'points'
   */
  async exec({ jsonFileUrl, jsonObject, outputTableName, geometryColumns, workspace = DEFAULT_WORKSPACE_NAME, workspaceCoordinateFormat = DEFAULT_WORKSPACE_COORDINATE_FORMAT }: LoadJsonParams & { workspaceCoordinateFormat?: string }): Promise<JsonTable> {
    if (!jsonFileUrl && !jsonObject) {
      throw new Error('Either jsonFileUrl or jsonObject must be provided');
    }
    if (jsonFileUrl && jsonObject) {
      throw new Error('Cannot provide both jsonFileUrl and jsonObject. Please provide only one.');
    }

    const jsonString = jsonFileUrl
      ? await fetch(jsonFileUrl).then((r) => {
          if (!r.ok) throw new Error(`HTTP error! Error to load ${jsonFileUrl}! Status: ${r.status}`);
          return r.text();
        })
      : JSON.stringify(jsonObject);

    const jsonPath = `temp_json_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.json`;
    await this.db.registerFileText(jsonPath, jsonString);

    const qualifiedTableName = `${workspace}.${outputTableName}`;
    let tableCreated = false;
    let tableType: JsonTable['type'];
    const normalizedGeometryColumns = geometryColumns === true
      ? {
          mode: 'lat-lng' as const,
          latColumnName: 'Latitude',
          longColumnName: 'Longitude',
          coordinateFormat: DEFAULT_INPUT_COORDINATE_FORMAT,
        }
      : geometryColumns && 'wktColumnName' in geometryColumns
        ? {
            mode: 'wkt' as const,
            wktColumnName: geometryColumns.wktColumnName,
            coordinateFormat: geometryColumns.coordinateFormat || DEFAULT_INPUT_COORDINATE_FORMAT,
          }
        : geometryColumns
          ? {
              mode: 'lat-lng' as const,
              latColumnName: geometryColumns.latColumnName,
              longColumnName: geometryColumns.longColumnName,
              coordinateFormat: geometryColumns.coordinateFormat || DEFAULT_INPUT_COORDINATE_FORMAT,
            }
          : null;

    if (normalizedGeometryColumns?.mode === 'lat-lng') {
      if (!normalizedGeometryColumns.latColumnName.trim() || !normalizedGeometryColumns.longColumnName.trim()) {
        throw new Error('Both latColumnName and longColumnName must be provided when using JSON latitude/longitude geometry columns.');
      }
    }
    if (normalizedGeometryColumns?.mode === 'wkt' && !normalizedGeometryColumns.wktColumnName.trim()) {
      throw new Error('wktColumnName must be provided when using JSON WKT geometry columns.');
    }

    let loadJsonQuery: string;
    if (normalizedGeometryColumns?.mode === 'lat-lng') {
      loadJsonQuery = LOAD_JSON_ON_TABLE_WITH_COORDINATES_QUERY({
        jsonFileUrl: jsonPath,
        tableName: outputTableName,
        latColumnName: normalizedGeometryColumns.latColumnName,
        longColumnName: normalizedGeometryColumns.longColumnName,
        sourceCrs: normalizedGeometryColumns.coordinateFormat,
        targetCrs: workspaceCoordinateFormat,
        workspace,
      });
      tableType = 'points';
    } else if (normalizedGeometryColumns?.mode === 'wkt') {
      loadJsonQuery = LOAD_JSON_ON_TABLE_WITH_WKT_QUERY({
        jsonFileUrl: jsonPath,
        tableName: outputTableName,
        wktColumnName: normalizedGeometryColumns.wktColumnName,
        sourceCrs: normalizedGeometryColumns.coordinateFormat,
        targetCrs: workspaceCoordinateFormat,
        workspace,
      });
    } else {
      loadJsonQuery = LOAD_JSON_ON_TABLE_QUERY(jsonPath, outputTableName, workspace);
    }

    try {
      const describeTableResponse = await this.conn.query(loadJsonQuery);
      tableCreated = true;
      const columns = getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray());

      if (normalizedGeometryColumns) {
        await this.ensureAllRowsHaveGeometry(qualifiedTableName);

        if (normalizedGeometryColumns.mode === 'wkt') {
          tableType = await this.inferWktLayerType(qualifiedTableName, normalizedGeometryColumns.wktColumnName);
        }

        const indexName = `idx_${outputTableName}_geometry`;
        await this.conn.query(`CREATE INDEX ${indexName} ON ${qualifiedTableName} USING RTREE (${DEFAULT_GEO_COLUMN_NAME});`);
      }

      return {
        source: 'json',
        name: outputTableName,
        columns,
        type: tableType,
      };
    } catch (error) {
      if (tableCreated) {
        await this.conn.query(`DROP TABLE IF EXISTS ${qualifiedTableName}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      if (normalizedGeometryColumns?.mode === 'wkt') {
        const wrappedError = new Error(`Failed to load JSON geometry from WKT column '${normalizedGeometryColumns.wktColumnName}': ${message}`) as Error & { cause?: unknown };
        wrappedError.cause = error;
        throw wrappedError;
      }
      if (normalizedGeometryColumns?.mode === 'lat-lng') {
        const wrappedError = new Error(`Failed to load JSON geometry from latitude/longitude columns '${normalizedGeometryColumns.latColumnName}' and '${normalizedGeometryColumns.longColumnName}': ${message}`) as Error & { cause?: unknown };
        wrappedError.cause = error;
        throw wrappedError;
      }
      throw error;
    } finally {
      await this.db.dropFile(jsonPath);
    }
  }

  /**
   * Verifies that every row in the table has a non-null geometry value.
   *
   * @param qualifiedTableName - fully-qualified table name (`workspace.table`).
   * @throws {Error} If any rows contain null geometry values.
   */
  private async ensureAllRowsHaveGeometry(qualifiedTableName: string): Promise<void> {
    const response = await this.conn.query(`
      SELECT COUNT(*) AS total_rows, COUNT(${DEFAULT_GEO_COLUMN_NAME}) AS geometry_rows
      FROM ${qualifiedTableName}
    `);
    const row = response.toArray()[0] as { total_rows?: number | bigint; geometry_rows?: number | bigint } | undefined;
    const totalRows = Number(row?.total_rows ?? 0);
    const geometryRows = Number(row?.geometry_rows ?? 0);

    if (totalRows !== geometryRows) {
      throw new Error(`Geometry creation produced ${totalRows - geometryRows} null geometries.`);
    }
  }

  /**
   * Infers the vector layer type by inspecting distinct geometry types in the table.
   *
   * Maps `POINT`/`MULTIPOINT` to `points`, `LINESTRING`/`MULTILINESTRING` to `polylines`, and `POLYGON`/`MULTIPOLYGON` to `polygons`.
   *
   * @param qualifiedTableName - fully-qualified table name (`workspace.table`).
   * @param wktColumnName - name of the original WKT column used in error messages.
   * @returns the single inferred layer type for the table.
   * @throws {Error} If no non-null geometries exist, if an unsupported geometry type is encountered, or if mixed geometry families are found.
   */
  private async inferWktLayerType(qualifiedTableName: string, wktColumnName: string): Promise<JsonGeometryLayerType> {
    const response = await this.conn.query(`
      SELECT DISTINCT CAST(ST_GeometryType(${DEFAULT_GEO_COLUMN_NAME}) AS VARCHAR) AS geometry_type
      FROM ${qualifiedTableName}
      WHERE ${DEFAULT_GEO_COLUMN_NAME} IS NOT NULL
      ORDER BY geometry_type
    `);

    const rawGeometryTypes = response.toArray().map((row: { geometry_type?: unknown }) => String(row.geometry_type ?? '').toUpperCase());
    if (rawGeometryTypes.length === 0) {
      throw new Error(`Could not infer a layer type from WKT column '${wktColumnName}' because no non-null geometries were created.`);
    }

    const inferredLayerTypes = new Set<JsonGeometryLayerType>();
    for (const rawGeometryType of rawGeometryTypes) {
      switch (rawGeometryType) {
        case 'POINT':
        case 'MULTIPOINT':
          inferredLayerTypes.add('points');
          break;
        case 'LINESTRING':
        case 'MULTILINESTRING':
          inferredLayerTypes.add('polylines');
          break;
        case 'POLYGON':
        case 'MULTIPOLYGON':
          inferredLayerTypes.add('polygons');
          break;
        default:
          throw new Error(`Unsupported WKT geometry type '${rawGeometryType}' in column '${wktColumnName}'.`);
      }
    }

    if (inferredLayerTypes.size !== 1) {
      throw new Error(`WKT column '${wktColumnName}' contains mixed geometry families: ${rawGeometryTypes.join(', ')}.`);
    }

    return Array.from(inferredLayerTypes)[0];
  }
}
