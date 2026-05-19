import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { CsvGeometryLayerType, LoadCsvParams } from './interfaces';
import { CsvTable } from '../../interfaces';
import { LOAD_CSV_ON_TABLE_QUERY, LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY, LOAD_CSV_ON_TABLE_WITH_WKT_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { DEFAULT_WORKSPACE_NAME, DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT, DEFAULT_GEO_COLUMN_NAME } from '../../consts';

/**
 * Loads CSV content into DuckDB and optionally materializes a geometry column.
 *
 * This use case accepts either a remote CSV file or an in-memory matrix, creates the target table, validates geometry creation, and returns the inferred table metadata.
 *
 * Geometry imports can be built from default latitude/longitude columns, custom coordinate columns, or a WKT column.
 *
 * @throws {Error} Propagates load, validation, and geometry inference failures raised while `exec` runs.
 * @example
 * const useCase = new LoadCsvUseCase(db, conn);
 * const table = await useCase.exec({
 *   csvFileUrl: 'https://example.com/cities.csv',
 *   outputTableName: 'cities',
 *   geometryColumns: true,
 * });
 * console.log(table.type); // 'points'
 */
export class LoadCsvUseCase {
  /** DuckDB instance used to register and clean up temporary CSV files. */
  private db: AsyncDuckDB;
  /** Active DuckDB connection used to execute the generated SQL statements. */
  private conn: AsyncDuckDBConnection;

  /**
   * Binds the CSV loading workflow to a DuckDB database and connection.
   *
   * The use case keeps both dependencies so it can register temporary files on the database and run SQL through the connection.
   *
   * @param db - DuckDB instance that stores temporary CSV content.
   * @param conn - DuckDB connection used for table creation, validation, and indexing queries.
   * @returns A `LoadCsvUseCase` instance ready to execute CSV imports.
   * @throws {TypeError} Runtime failures can occur later if the provided DuckDB objects do not implement the expected APIs.
   * @example
   * const useCase = new LoadCsvUseCase(db, conn);
   */
  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  /**
   * Loads a CSV source into a workspace table and returns the resulting table metadata.
   *
   * The method fetches or serializes CSV content, creates the DuckDB table, optionally builds geometry, validates that geometry creation succeeded for every row, and adds a spatial index when geometry exists.
   *
   * Exactly one of `csvFileUrl` or `csvObject` must be provided.
   * @param params - CSV source information, output table settings, and optional geometry configuration.
   * @returns Metadata describing the created CSV-backed table and its inferred layer type.
   * @throws {Error} If no CSV source is provided, both CSV sources are provided, the remote fetch fails, geometry columns are invalid, geometry creation produces null values, WKT types cannot be inferred, or DuckDB rejects the generated SQL.
   * @example
   * const table = await useCase.exec({
   *   csvObject: [
   *     ['Latitude', 'Longitude', 'name'],
   *     [48.8566, 2.3522, 'Paris'],
   *   ],
   *   outputTableName: 'cities',
   *   geometryColumns: true,
   * });
   * console.log(table.name); // 'cities'
   */
  async exec({ csvFileUrl, csvObject, outputTableName, geometryColumns, delimiter = ',', workspace = DEFAULT_WORKSPACE_NAME, workspaceCoordinateFormat = DEFAULT_WORKSPACE_COORDINATE_FORMAT }: LoadCsvParams & { workspaceCoordinateFormat?: string }): Promise<CsvTable> {
    if (!csvFileUrl && !csvObject) {
      throw new Error('Either csvFileUrl or csvObject must be provided');
    }
    if (csvFileUrl && csvObject) {
      throw new Error('Cannot provide both csvFileUrl and csvObject. Please provide only one.');
    }

    const csvString = csvFileUrl
      ? await fetch(csvFileUrl).then((r) => {
          if (!r.ok) throw new Error(`HTTP error! Error to load ${csvFileUrl}! Status: ${r.status}`);
          return r.text();
        })
      : this.buildCsvString(csvObject!, delimiter);

    const csvPath = `temp_csv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.csv`;
    await this.db.registerFileText(csvPath, csvString);

    const qualifiedTableName = `${workspace}.${outputTableName}`;
    let tableCreated = false;
    let tableType: CsvTable['type'];
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
        throw new Error('Both latColumnName and longColumnName must be provided when using CSV latitude/longitude geometry columns.');
      }
    }
    if (normalizedGeometryColumns?.mode === 'wkt' && !normalizedGeometryColumns.wktColumnName.trim()) {
      throw new Error('wktColumnName must be provided when using CSV WKT geometry columns.');
    }

    let loadCsvQuery: string;
    if (normalizedGeometryColumns?.mode === 'lat-lng') {
      loadCsvQuery = LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY({
        csvFileUrl: csvPath,
        tableName: outputTableName,
        delimiter,
        latColumnName: normalizedGeometryColumns.latColumnName,
        longColumnName: normalizedGeometryColumns.longColumnName,
        sourceCrs: normalizedGeometryColumns.coordinateFormat,
        targetCrs: workspaceCoordinateFormat,
        workspace,
      });
      tableType = 'points';
    } else if (normalizedGeometryColumns?.mode === 'wkt') {
      loadCsvQuery = LOAD_CSV_ON_TABLE_WITH_WKT_QUERY({
        csvFileUrl: csvPath,
        tableName: outputTableName,
        delimiter,
        wktColumnName: normalizedGeometryColumns.wktColumnName,
        sourceCrs: normalizedGeometryColumns.coordinateFormat,
        targetCrs: workspaceCoordinateFormat,
        workspace,
      });
    } else {
      loadCsvQuery = LOAD_CSV_ON_TABLE_QUERY(csvPath, outputTableName, delimiter, workspace);
    }

    try {
      const describeTableResponse = await this.conn.query(loadCsvQuery);
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
        source: 'csv',
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
        const wrappedError = new Error(`Failed to load CSV geometry from WKT column '${normalizedGeometryColumns.wktColumnName}': ${message}`) as Error & { cause?: unknown };
        wrappedError.cause = error;
        throw wrappedError;
      }
      if (normalizedGeometryColumns?.mode === 'lat-lng') {
        const wrappedError = new Error(`Failed to load CSV geometry from latitude/longitude columns '${normalizedGeometryColumns.latColumnName}' and '${normalizedGeometryColumns.longColumnName}': ${message}`) as Error & { cause?: unknown };
        wrappedError.cause = error;
        throw wrappedError;
      }
      throw error;
    } finally {
      await this.db.dropFile(csvPath);
    }
  }

  /**
   * Verifies that every imported row received a non-null geometry value.
   *
   * This guard catches partial geometry creation failures before the table is returned to callers.
   *
   * @param qualifiedTableName - Fully qualified name of the imported table to inspect.
   * @returns Resolves when the table contains geometry for every row.
   * @throws {Error} If any row is missing the generated geometry value.
   * @example
   * await this.ensureAllRowsHaveGeometry('main.cities');
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
   * Infers the vector layer family produced by a WKT geometry column.
   *
   * The method inspects the created DuckDB geometry column, normalizes geometry type names, and rejects unsupported or mixed geometry families.
   *
   * @param qualifiedTableName - Fully qualified name of the imported table that contains the generated geometry column.
   * @param wktColumnName - Original WKT column name used to build error messages.
   * @returns The single inferred CSV geometry layer type for the imported table.
   * @throws {Error} If no non-null geometries were created, if the geometry type is unsupported, or if the table mixes incompatible geometry families.
   * @example
   * const type = await this.inferWktLayerType('main.parcels', 'wkt');
   * console.log(type); // 'polygons'
   */
  private async inferWktLayerType(qualifiedTableName: string, wktColumnName: string): Promise<CsvGeometryLayerType> {
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

    const inferredLayerTypes = new Set<CsvGeometryLayerType>();
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

  /**
   * Serializes an in-memory CSV matrix into a quoted CSV string.
   *
   * Every cell is converted to text, double quotes are escaped, and each value is wrapped in quotes so DuckDB receives a predictable CSV payload.
   *
   * @param csvObject - CSV rows to serialize, including the header row.
   * @param delimiter - Delimiter inserted between serialized values.
   * @returns A CSV string ready to register as a temporary DuckDB file.
   * @throws {Error} JavaScript can throw if a row value cannot be stringified by `String`, though ordinary values are handled safely.
   * @example
   * const csv = this.buildCsvString([
   *   ['name', 'value'],
   *   ['Paris', '"quoted"'],
   * ], ',');
   * console.log(csv);
   * // "name","value"\n"Paris","""quoted"""
   */
  private buildCsvString(csvObject: unknown[][], delimiter: string): string {
    return csvObject
      .map((row) =>
        row
          .map((value) => {
            const str = String(value ?? '');
            const escaped = str.replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(delimiter),
      )
      .join('\n');
  }
}
