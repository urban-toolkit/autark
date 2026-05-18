import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { JsonGeometryLayerType, LoadJsonParams } from './interfaces';
import { JsonTable } from '../../interfaces';
import { LOAD_JSON_ON_TABLE_QUERY, LOAD_JSON_ON_TABLE_WITH_COORDINATES_QUERY, LOAD_JSON_ON_TABLE_WITH_WKT_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { DEFAULT_GEO_COLUMN_NAME, DEFAULT_WORKSPACE_NAME, DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../../consts';

/**
 * Loads JSON data into DuckDB, with optional geometry column creation.
 */
export class LoadJsonUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  async exec({ jsonFileUrl, jsonObject, outputTableName, geometryColumns, workspace = DEFAULT_WORKSPACE_NAME, workspaceCoordinateFormat = DEFAULT_WORKSPACE_COORDINATE_FORMAT }: LoadJsonParams & { workspaceCoordinateFormat?: string }): Promise<JsonTable> {
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
      if (tempFileCreated) {
        await this.db.dropFile(jsonPath);
      }
    }
  }

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
