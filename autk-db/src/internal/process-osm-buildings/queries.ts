/**
 * Generates a query to select building geometry as GeoJSON.
 * @param qualifiedTableName The workspace-qualified table name.
 * @returns A SQL string selecting ID and GeoJSON geometry.
 * @example const sql = SELECT_BUILDING_GEOMETRY_QUERY('autk.osm_buildings');
 */
export const SELECT_BUILDING_GEOMETRY_QUERY = (qualifiedTableName: string) => `
  SELECT id, CAST(ST_AsGeoJSON(geometry) AS JSON) AS geometry_json
  FROM ${qualifiedTableName}
`;

/**
 * Generates a query to add a `building_id` column.
 * @param qualifiedTableName The workspace-qualified table name.
 * @returns A SQL string to alter the table.
 * @example const sql = ALTER_ADD_BUILDING_ID_QUERY('autk.osm_buildings');
 */
export const ALTER_ADD_BUILDING_ID_QUERY = (qualifiedTableName: string) =>
  `ALTER TABLE ${qualifiedTableName} ADD COLUMN building_id BIGINT`;

/**
 * Generates a query to create a temporary table from a JSON file.
 * @param vfsPath The path to the JSON file in the DuckDB VFS.
 * @returns A SQL string to create the temp table.
 * @example const sql = CREATE_TEMP_JSON_TABLE_QUERY('tmp.json');
 */
export const CREATE_TEMP_JSON_TABLE_QUERY = (vfsPath: string) =>
  `CREATE TEMP TABLE __tmp_building_ids_json AS SELECT * FROM '${vfsPath}'`;

/**
 * Generates a query to create a temporary table for building IDs.
 * @returns A SQL string to create the temp table by unnesting JSON rows.
 * @example const sql = CREATE_TEMP_IDS_TABLE_QUERY();
 */
export const CREATE_TEMP_IDS_TABLE_QUERY = () => `
  CREATE TEMP TABLE __tmp_building_ids AS
  SELECT CAST(row.id AS BIGINT) AS id, CAST(row.building_id AS BIGINT) AS building_id
  FROM (SELECT UNNEST(rows) AS row FROM __tmp_building_ids_json);
`;

/**
 * Generates a query to update the target table with building IDs.
 * @param qualifiedTableName The workspace-qualified table name.
 * @returns A SQL string to perform the update join.
 * @example const sql = UPDATE_BUILDING_IDS_QUERY('autk.osm_buildings');
 */
export const UPDATE_BUILDING_IDS_QUERY = (qualifiedTableName: string) =>
  `UPDATE ${qualifiedTableName} AS t SET building_id = b.building_id FROM __tmp_building_ids AS b WHERE t.id = b.id`;

/**
 * Generates a query to drop the temporary IDs table.
 * @returns A SQL string to drop the table.
 * @example const sql = DROP_TEMP_IDS_TABLE_QUERY();
 */
export const DROP_TEMP_IDS_TABLE_QUERY = () => `DROP TABLE __tmp_building_ids`;

/**
 * Generates a query to drop the temporary JSON table.
 * @returns A SQL string to drop the table.
 * @example const sql = DROP_TEMP_JSON_TABLE_QUERY();
 */
export const DROP_TEMP_JSON_TABLE_QUERY = () => `DROP TABLE __tmp_building_ids_json`;

/**
 * Generates a query to get table information via PRAGMA.
 * @param tableName The name of the table.
 * @returns A SQL string for PRAGMA table_info.
 * @example const sql = PRAGMA_TABLE_INFO_QUERY('osm_buildings');
 */
export const PRAGMA_TABLE_INFO_QUERY = (tableName: string) =>
  `PRAGMA table_info('${tableName}')`;

/**
 * Generates a query to describe the table schema.
 * @param tableName The name of the table.
 * @returns A SQL string for DESCRIBE.
 * @example const sql = DESCRIBE_TABLE_QUERY('osm_buildings');
 */
export const DESCRIBE_TABLE_QUERY = (tableName: string) => `DESCRIBE ${tableName}`;

/**
 * Generates a query to select unique building IDs.
 * @param qualifiedTableName The workspace-qualified table name.
 * @returns A SQL string selecting non-null building IDs.
 * @example const sql = SELECT_BUILDING_IDS_QUERY('autk.osm_buildings');
 */
export const SELECT_BUILDING_IDS_QUERY = (qualifiedTableName: string) => `
  SELECT building_id
  FROM ${qualifiedTableName}
  WHERE building_id IS NOT NULL
  GROUP BY building_id
`;

/**
 * Generates a query to create a temporary aggregation table.
 * @param tempTableName The name of the temporary table.
 * @returns A SQL string to create the table with building_id and agg_geometry.
 * @example const sql = CREATE_TEMP_AGG_TABLE_QUERY('tmp_agg');
 */
export const CREATE_TEMP_AGG_TABLE_QUERY = (tempTableName: string) =>
  `CREATE OR REPLACE TEMP TABLE ${tempTableName} (building_id BIGINT, agg_geometry BLOB)`;

/**
 * Generates a query to batch insert aggregated geometries.
 * @param qualifiedTableName The workspace-qualified table name.
 * @param tempTableName The temporary aggregation table name.
 * @param ids A comma-separated list of building IDs.
 * @returns A SQL string for batch insertion using ST_Union_Agg.
 * @example const sql = BATCH_INSERT_QUERY('autk.osm_buildings', 'tmp_agg', '1,2,3');
 */
export const BATCH_INSERT_QUERY = (qualifiedTableName: string, tempTableName: string, ids: string) => `
  INSERT INTO ${tempTableName}
  SELECT
    building_id,
    ST_Union_Agg(ST_Buffer(geometry, 0.0)) AS agg_geometry
  FROM ${qualifiedTableName}
  WHERE building_id IN (${ids})
    AND ST_IsValid(geometry)
  GROUP BY building_id;
`;

/**
 * Generates a query to insert aggregated geometry for a single building.
 * @param qualifiedTableName The workspace-qualified table name.
 * @param tempTableName The temporary aggregation table name.
 * @param buildingId The ID of the building.
 * @returns A SQL string for single insertion.
 * @example const sql = SINGLE_INSERT_QUERY('autk.osm_buildings', 'tmp_agg', '123');
 */
export const SINGLE_INSERT_QUERY = (qualifiedTableName: string, tempTableName: string, buildingId: string) => `
  INSERT INTO ${tempTableName}
  SELECT
    ${buildingId} AS building_id,
    ST_Union_Agg(ST_Buffer(geometry, 0.0)) AS agg_geometry
  FROM ${qualifiedTableName}
  WHERE building_id = ${buildingId}
    AND ST_IsValid(geometry)
  GROUP BY building_id;
`;

/**
 * Generates a query to insert a NULL entry for a building.
 * @param tempTableName The temporary aggregation table name.
 * @param buildingId The ID of the building.
 * @returns A SQL string to insert a row with NULL geometry.
 * @example const sql = NULL_INSERT_QUERY('tmp_agg', '123');
 */
export const NULL_INSERT_QUERY = (tempTableName: string, buildingId: string) =>
  `INSERT INTO ${tempTableName} (building_id, agg_geometry) VALUES (${buildingId}, NULL);`;

/**
 * Generates a query to join the aggregated geometry back to the main table.
 * @param qualifiedTableName The workspace-qualified table name.
 * @param tempTableName The temporary aggregation table name.
 * @returns A SQL string to update the main table with aggregated geometry.
 * @example const sql = ADD_AGG_COLUMN_QUERY('autk.osm_buildings', 'tmp_agg');
 */
export const ADD_AGG_COLUMN_QUERY = (qualifiedTableName: string, tempTableName: string) => `
  CREATE OR REPLACE TABLE ${qualifiedTableName} AS
  SELECT
    b.*,
    agg.agg_geometry
  FROM ${qualifiedTableName} b
  LEFT JOIN ${tempTableName} agg ON b.building_id = agg.building_id;
`;

/**
 * Generates a query to count rows with missing aggregated geometry.
 * @param qualifiedTableName The workspace-qualified table name.
 * @returns A SQL string to count NULL agg_geometry rows.
 * @example const sql = NULL_COUNT_QUERY('autk.osm_buildings');
 */
export const NULL_COUNT_QUERY = (qualifiedTableName: string) => `
  SELECT COUNT(*) AS cnt
  FROM ${qualifiedTableName}
  WHERE agg_geometry IS NULL
`;

/**
 * Generates a query to drop a temporary table.
 * @param tempTableName The name of the temporary table.
 * @returns A SQL string to drop the table if it exists.
 * @example const sql = DROP_TEMP_TABLE_QUERY('tmp_agg');
 */
export const DROP_TEMP_TABLE_QUERY = (tempTableName: string) =>
  `DROP TABLE IF EXISTS ${tempTableName};`;
