import { DEFAULT_GEO_COLUMN_NAME } from '../../consts';

/**
 * Builds the SQL used to load a non-spatial CSV table into a workspace.
 *
 * The returned statement creates or replaces the target table from DuckDB `READ_CSV` output and finishes with `DESCRIBE` so callers can inspect the created schema.
 *
 * @param csvFileUrl - Temporary DuckDB file path registered for the CSV content.
 * @param tableName - Unqualified target table name to create inside the workspace.
 * @param delimiter - Field delimiter expected by DuckDB while parsing the CSV content.
 * @param workspace - Workspace schema that namespaces the created table.
 * @returns A SQL string that creates the table and describes its columns.
 * @throws {Error} DuckDB will reject the generated SQL at execution time if identifiers or CSV options are invalid.
 * @example
 * const sql = LOAD_CSV_ON_TABLE_QUERY('temp.csv', 'cities', ',', 'main');
 * console.log(sql.includes('CREATE OR REPLACE TABLE main.cities')); // true
 */
export const LOAD_CSV_ON_TABLE_QUERY = (csvFileUrl: string, tableName: string, delimiter: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
        CREATE OR REPLACE TABLE ${qualifiedTableName} AS
            SELECT * FROM READ_CSV(
                '${csvFileUrl}',
                delim='${delimiter}',
                HEADER=TRUE,
                AUTO_DETECT=TRUE
            );

        DESCRIBE ${qualifiedTableName};
  `;
};

/**
 * Groups the inputs required to build the latitude/longitude CSV load query.
 *
 * These values are interpolated into SQL that creates point geometry and transforms it into the workspace CRS.
 *
 * @example
 * const params: LoadCsvOnTableWithCoordinatesParams = {
 *   csvFileUrl: 'temp.csv',
 *   tableName: 'cities',
 *   delimiter: ',',
 *   latColumnName: 'lat',
 *   longColumnName: 'lng',
 *   sourceCrs: 'EPSG:4326',
 *   targetCrs: 'EPSG:3857',
 *   workspace: 'main',
 * };
 */
interface LoadCsvOnTableWithCoordinatesParams {
  /** Temporary DuckDB file path registered for the CSV content. */
  csvFileUrl: string;
  /** Unqualified target table name to create inside the workspace. */
  tableName: string;
  /** Field delimiter expected by DuckDB while parsing the CSV content. */
  delimiter: string;
  /** Column name that contains latitude values. */
  latColumnName: string;
  /** Column name that contains longitude values. */
  longColumnName: string;
  /** CRS assigned to the source coordinate columns. */
  sourceCrs: string;
  /** CRS used by the destination workspace geometry column. */
  targetCrs: string;
  /** Workspace schema that namespaces the created table. */
  workspace: string;
}

/**
 * Groups the inputs required to build the WKT CSV load query.
 *
 * These values are interpolated into SQL that parses WKT text, transforms it, and stores the result in the default geometry column.
 *
 * @example
 * const params: LoadCsvOnTableWithWktParams = {
 *   csvFileUrl: 'temp.csv',
 *   tableName: 'parcels',
 *   delimiter: ',',
 *   wktColumnName: 'wkt',
 *   sourceCrs: 'EPSG:4326',
 *   targetCrs: 'EPSG:3857',
 *   workspace: 'main',
 * };
 */
interface LoadCsvOnTableWithWktParams {
  /** Temporary DuckDB file path registered for the CSV content. */
  csvFileUrl: string;
  /** Unqualified target table name to create inside the workspace. */
  tableName: string;
  /** Field delimiter expected by DuckDB while parsing the CSV content. */
  delimiter: string;
  /** Column name that contains WKT geometry text. */
  wktColumnName: string;
  /** CRS assigned to the source WKT geometry values. */
  sourceCrs: string;
  /** CRS used by the destination workspace geometry column. */
  targetCrs: string;
  /** Workspace schema that namespaces the created table. */
  workspace: string;
}

/**
 * Builds the SQL used to load a CSV table and derive geometry from coordinate columns.
 *
 * The generated statement reads the CSV, creates a projected point geometry in the default geometry column, and finishes with `DESCRIBE` so callers can inspect the created schema.
 *
 * @param params - CSV source details, coordinate column names, and CRS information for the generated point geometry.
 * @returns A SQL string that creates the spatial table and describes its columns.
 * @throws {Error} DuckDB will reject the generated SQL at execution time if column identifiers, CRS values, or CSV options are invalid.
 * @example
 * const sql = LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY({
 *   csvFileUrl: 'temp.csv',
 *   tableName: 'cities',
 *   delimiter: ',',
 *   latColumnName: 'lat',
 *   longColumnName: 'lng',
 *   sourceCrs: 'EPSG:4326',
 *   targetCrs: 'EPSG:3857',
 *   workspace: 'main',
 * });
 * console.log(sql.includes(`AS ${DEFAULT_GEO_COLUMN_NAME}`)); // true
 */
export const LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY = ({
  csvFileUrl,
  tableName,
  delimiter,
  latColumnName,
  longColumnName,
  sourceCrs,
  targetCrs,
  workspace,
}: LoadCsvOnTableWithCoordinatesParams) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
    CREATE TABLE ${qualifiedTableName} AS
      SELECT
          *,
          ST_Transform(
              ST_Point(CAST(${longColumnName} AS DOUBLE), CAST(${latColumnName} AS DOUBLE)),
              '${sourceCrs}',
              '${targetCrs}',
              always_xy := true
          ) AS ${DEFAULT_GEO_COLUMN_NAME}
      FROM READ_CSV(
          '${csvFileUrl}',
          delim='${delimiter}',
          HEADER=TRUE,
          AUTO_DETECT=TRUE
      );

    DESCRIBE ${qualifiedTableName};
  `;
};

/**
 * Builds the SQL used to load a CSV table and derive geometry from a WKT column.
 *
 * The generated statement reads the CSV, parses and transforms WKT geometries into the default geometry column, and finishes with `DESCRIBE` so callers can inspect the created schema.
 *
 * @param params - CSV source details, WKT column name, and CRS information for the generated geometry.
 * @returns A SQL string that creates the spatial table and describes its columns.
 * @throws {Error} DuckDB will reject the generated SQL at execution time if the WKT column, CRS values, or CSV options are invalid.
 * @example
 * const sql = LOAD_CSV_ON_TABLE_WITH_WKT_QUERY({
 *   csvFileUrl: 'temp.csv',
 *   tableName: 'parcels',
 *   delimiter: ',',
 *   wktColumnName: 'wkt',
 *   sourceCrs: 'EPSG:4326',
 *   targetCrs: 'EPSG:3857',
 *   workspace: 'main',
 * });
 * console.log(sql.includes('ST_GeomFromText')); // true
 */
export const LOAD_CSV_ON_TABLE_WITH_WKT_QUERY = ({
  csvFileUrl,
  tableName,
  delimiter,
  wktColumnName,
  sourceCrs,
  targetCrs,
  workspace,
}: LoadCsvOnTableWithWktParams) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
    CREATE TABLE ${qualifiedTableName} AS
      SELECT
          *,
          ST_Transform(
              ST_GeomFromText(CAST(${wktColumnName} AS VARCHAR)),
              '${sourceCrs}',
              '${targetCrs}',
              always_xy := true
          ) AS ${DEFAULT_GEO_COLUMN_NAME}
      FROM READ_CSV(
          '${csvFileUrl}',
          delim='${delimiter}',
          HEADER=TRUE,
          AUTO_DETECT=TRUE
      );

    DESCRIBE ${qualifiedTableName};
  `;
};
