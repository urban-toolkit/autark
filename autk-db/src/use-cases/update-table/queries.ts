/**
 * Builds a DuckDB SQL query to replace a layer table from a GeoJSON file.
 *
 * Extracts `geometry` and `properties` from each feature, transforming the geometry via `ST_GeomFromGeoJSON`.
 *
 * @param tempFileName - virtual file path registered in DuckDB's in-memory filesystem.
 * @param tableName - unqualified name of the target table.
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that replaces the table and describes its columns.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = REPLACE_LAYER_TABLE_QUERY('temp.json', 'buildings', 'main');
 */
export const REPLACE_LAYER_TABLE_QUERY = (
  tempFileName: string,
  tableName: string,
  workspace: string,
) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  
  return `
    CREATE OR REPLACE TABLE ${qualifiedTableName} AS
    SELECT
      ST_GeomFromGeoJSON(JSON(feature.geometry)) AS geometry,
      CAST(feature.properties AS JSON) AS properties
    FROM (
      SELECT UNNEST(features) AS feature
      FROM read_json_auto('${tempFileName}')
    );
    
    DESCRIBE ${qualifiedTableName};
  `;
};

/**
 * Builds a DuckDB SQL query to replace a non-layer table (CSV/JSON-derived) from a JSON file.
 *
 * Reads the JSON directly via `read_json_auto` without any geometry transformation.
 *
 * @param tempFileName - virtual file path registered in DuckDB's in-memory filesystem.
 * @param tableName - unqualified name of the target table.
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that replaces the table and describes its columns.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = REPLACE_DATA_TABLE_QUERY('temp.json', 'places', 'main');
 */
export const REPLACE_DATA_TABLE_QUERY = (
  tempFileName: string,
  tableName: string,
  workspace: string,
) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  
  return `
    CREATE OR REPLACE TABLE ${qualifiedTableName} AS
    SELECT * FROM read_json_auto('${tempFileName}');
    
    DESCRIBE ${qualifiedTableName};
  `;
};

/**
 * Builds a DuckDB SQL query to create a temporary staging table from a GeoJSON file.
 *
 * Used during upsert operations to hold transformed feature data before merging into the target table.
 *
 * @param tempFileName - virtual file path registered in DuckDB's in-memory filesystem.
 * @param stagingTableName - name of the temporary staging table.
 * @returns SQL string that creates the staging table.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = CREATE_LAYER_STAGING_TABLE_QUERY('temp.json', '_staging_buildings');
 */
export const CREATE_LAYER_STAGING_TABLE_QUERY = (
  tempFileName: string,
  stagingTableName: string,
) => {
  return `
    CREATE OR REPLACE TEMP TABLE ${stagingTableName} AS
    SELECT
      ST_GeomFromGeoJSON(JSON(feature.geometry)) AS geometry,
      CAST(feature.properties AS JSON) AS properties
    FROM (
      SELECT UNNEST(features) AS feature
      FROM read_json_auto('${tempFileName}')
    );
  `;
};

/**
 * Builds a DuckDB SQL query to create a temporary staging table from a JSON file.
 *
 * Used during upsert operations for non-layer tables.
 *
 * @param tempFileName - virtual file path registered in DuckDB's in-memory filesystem.
 * @param stagingTableName - name of the temporary staging table.
 * @returns SQL string that creates the staging table.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = CREATE_DATA_STAGING_TABLE_QUERY('temp.json', '_staging_places');
 */
export const CREATE_DATA_STAGING_TABLE_QUERY = (
  tempFileName: string,
  stagingTableName: string,
) => {
  return `
    CREATE OR REPLACE TEMP TABLE ${stagingTableName} AS
    SELECT * FROM read_json_auto('${tempFileName}');
  `;
};

/**
 * Builds a DuckDB SQL query to update matching layer records from a staging table.
 *
 * Sets `geometry` and `properties` on rows whose ID matches a row in the staging table.
 *
 * @param tableName - unqualified name of the target table.
 * @param stagingTableName - name of the staging table holding new values.
 * @param idSqlExpression - SQL expression for the ID column (e.g. `id` or `properties->>'building_id'`).
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that performs the UPDATE.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = UPDATE_LAYER_FROM_STAGING_QUERY('buildings', '_staging_b', 'id', 'main');
 */
export const UPDATE_LAYER_FROM_STAGING_QUERY = (
  tableName: string,
  stagingTableName: string,
  idSqlExpression: string,
  workspace: string,
) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  
  // Use explicit column references without table alias for the JSON expression
  // to avoid syntax issues with DuckDB's JSON operators
  return `
    UPDATE ${qualifiedTableName}
    SET 
      geometry = staging.geometry,
      properties = staging.properties
    FROM ${stagingTableName} AS staging
    WHERE ${qualifiedTableName}.${idSqlExpression} = staging.${idSqlExpression};
  `;
};

/**
 * Builds a DuckDB SQL query to delete rows whose ID exists in a staging table.
 *
 * @param tableName - unqualified name of the target table.
 * @param stagingTableName - name of the staging table containing IDs to delete.
 * @param idSqlExpression - SQL expression for the ID column (e.g. `id` or `properties->>'building_id'`).
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that performs the DELETE.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = DELETE_MATCHING_IDS_QUERY('places', '_staging_p', 'id', 'main');
 */
export const DELETE_MATCHING_IDS_QUERY = (
  tableName: string,
  stagingTableName: string,
  idSqlExpression: string,
  workspace: string,
) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  
  return `
    DELETE FROM ${qualifiedTableName}
    WHERE ${idSqlExpression} IN (
      SELECT ${idSqlExpression} FROM ${stagingTableName}
    );
  `;
};

/**
 * Builds a DuckDB SQL query to insert all rows from a staging table into the target table.
 *
 * Requires that the staging and target tables share the same column structure.
 *
 * @param tableName - unqualified name of the target table.
 * @param stagingTableName - name of the staging table containing rows to insert.
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that performs the INSERT.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = INSERT_FROM_STAGING_QUERY('places', '_staging_p', 'main');
 */
export const INSERT_FROM_STAGING_QUERY = (
  tableName: string,
  stagingTableName: string,
  workspace: string,
) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  
  return `
    INSERT INTO ${qualifiedTableName}
    SELECT * FROM ${stagingTableName};
  `;
};

/**
 * Builds a DuckDB SQL query to insert new layer records from a staging table.
 *
 * Only inserts rows whose ID does not already exist in the target table.
 *
 * @param tableName - unqualified name of the target table.
 * @param stagingTableName - name of the staging table containing rows to insert.
 * @param idSqlExpression - SQL expression for the ID column (e.g. `id` or `properties->>'building_id'`).
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that performs the conditional INSERT.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = INSERT_LAYER_FROM_STAGING_QUERY('buildings', '_staging_b', 'id', 'main');
 */
export const INSERT_LAYER_FROM_STAGING_QUERY = (
  tableName: string,
  stagingTableName: string,
  idSqlExpression: string,
  workspace: string,
) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  
  return `
    INSERT INTO ${qualifiedTableName} (geometry, properties)
    SELECT staging.geometry, staging.properties
    FROM ${stagingTableName} AS staging
    WHERE NOT EXISTS (
      SELECT 1 FROM ${qualifiedTableName} AS target
      WHERE target.${idSqlExpression} = staging.${idSqlExpression}
    );
  `;
};

/**
 * Builds a DuckDB SQL query to drop a staging table.
 *
 * @param stagingTableName - name of the staging table to drop.
 * @returns SQL string that drops the table if it exists.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = DROP_STAGING_TABLE_QUERY('_staging_buildings');
 */
export const DROP_STAGING_TABLE_QUERY = (stagingTableName: string) => {
  return `DROP TABLE IF EXISTS ${stagingTableName};`;
};

/**
 * Builds a DuckDB SQL query to describe a table and retrieve its column metadata.
 *
 * @param tableName - unqualified name of the table to describe.
 * @param workspace - workspace namespace that qualifies the table name.
 * @returns SQL string that describes the table.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = DESCRIBE_TABLE_QUERY('places', 'main');
 */
export const DESCRIBE_TABLE_QUERY = (tableName: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `DESCRIBE ${qualifiedTableName};`;
};
