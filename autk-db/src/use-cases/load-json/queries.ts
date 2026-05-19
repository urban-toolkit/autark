import { DEFAULT_GEO_COLUMN_NAME } from '../../consts';

/**
 * Parameters for building a SQL query that creates geometry from lat/lng columns.
 */
interface LoadJsonOnTableWithCoordinatesParams {
  jsonFileUrl: string;
  tableName: string;
  latColumnName: string;
  longColumnName: string;
  sourceCrs: string;
  targetCrs: string;
  workspace: string;
}

/**
 * Parameters for building a SQL query that creates geometry from a WKT column.
 */
interface LoadJsonOnTableWithWktParams {
  jsonFileUrl: string;
  tableName: string;
  wktColumnName: string;
  sourceCrs: string;
  targetCrs: string;
  workspace: string;
}

/**
 * Builds a DuckDB SQL query to load a JSON file into a table without geometry.
 *
 * Uses `read_json_auto` to infer the schema and create the table in one step.
 *
 * @param jsonFileUrl - virtual file path registered in DuckDB's in-memory filesystem.
 * @param tableName - unqualified name of the table to create.
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that creates the table and describes its columns.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = LOAD_JSON_ON_TABLE_QUERY('data.json', 'places', 'main');
 * // Creates table main.places and describes its schema.
 */
export const LOAD_JSON_ON_TABLE_QUERY = (jsonFileUrl: string, tableName: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
        CREATE OR REPLACE TABLE ${qualifiedTableName} AS
            SELECT * FROM read_json_auto('${jsonFileUrl}');

        DESCRIBE ${qualifiedTableName};
  `;
};

/**
 * Builds a DuckDB SQL query to load JSON data and create point geometry from lat/lng columns.
 *
 * Casts the latitude and longitude fields to `DOUBLE`, constructs points, and transforms them from the source CRS to the target CRS.
 *
 * @param jsonFileUrl - virtual file path registered in DuckDB's in-memory filesystem.
 * @param tableName - unqualified name of the table to create.
 * @param latColumnName - JSON field name containing latitude values.
 * @param longColumnName - JSON field name containing longitude values.
 * @param sourceCrs - source coordinate reference system (e.g. `EPSG:4326`).
 * @param targetCrs - target coordinate reference system for the workspace.
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that creates the table with a geometry column and describes its schema.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = LOAD_JSON_ON_TABLE_WITH_COORDINATES_QUERY({ jsonFileUrl: 'data.json', tableName: 'stops', latColumnName: 'lat', longColumnName: 'lng', sourceCrs: 'EPSG:4326', targetCrs: 'EPSG:3857', workspace: 'main' });
 */
export const LOAD_JSON_ON_TABLE_WITH_COORDINATES_QUERY = ({
  jsonFileUrl,
  tableName,
  latColumnName,
  longColumnName,
  sourceCrs,
  targetCrs,
  workspace,
}: LoadJsonOnTableWithCoordinatesParams) => {
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
      FROM read_json_auto('${jsonFileUrl}');

    DESCRIBE ${qualifiedTableName};
  `;
};

/**
 * Builds a DuckDB SQL query to load JSON data and create geometry from a WKT column.
 *
 * Parses WKT text via `ST_GeomFromText`, then transforms from the source CRS to the target CRS.
 *
 * @param jsonFileUrl - virtual file path registered in DuckDB's in-memory filesystem.
 * @param tableName - unqualified name of the table to create.
 * @param wktColumnName - JSON field name containing WKT geometry strings.
 * @param sourceCrs - source coordinate reference system (e.g. `EPSG:4326`).
 * @param targetCrs - target coordinate reference system for the workspace.
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that creates the table with a geometry column and describes its schema.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = LOAD_JSON_ON_TABLE_WITH_WKT_QUERY({ jsonFileUrl: 'data.json', tableName: 'parcels', wktColumnName: 'shape', sourceCrs: 'EPSG:4326', targetCrs: 'EPSG:3857', workspace: 'main' });
 */
export const LOAD_JSON_ON_TABLE_WITH_WKT_QUERY = ({
  jsonFileUrl,
  tableName,
  wktColumnName,
  sourceCrs,
  targetCrs,
  workspace,
}: LoadJsonOnTableWithWktParams) => {
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
      FROM read_json_auto('${jsonFileUrl}');

    DESCRIBE ${qualifiedTableName};
  `;
};
