/**
 * Query to create a temporary table from a GeoJSON file for layer updates.
 * Transforms GeoJSON features into the internal layer format (geometry + properties).
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
 * Query to replace a non-layer table (CSV/JSON) with new data.
 * Data is inserted directly without geometry transformation.
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
 * Query to load GeoJSON features into a temporary staging table for upsert operations.
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
 * Query to load JSON array into a temporary staging table for upsert operations.
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
 * Query to update existing layer records (geometry and properties) based on ID match.
 * Used for upsert operations on layer tables.
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
 * Query to delete matching records from target table based on IDs in staging table.
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
 * Query to insert all records from staging table into target table.
 * Only works when staging table has same columns as target table.
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
 * Query to insert layer records (geometry, properties) from staging into target.
 * Used for inserting new records that don't exist in target.
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
 * Query to drop the staging table after upsert operation.
 */
export const DROP_STAGING_TABLE_QUERY = (stagingTableName: string) => {
  return `DROP TABLE IF EXISTS ${stagingTableName};`;
};

/**
 * Query to describe a table and get its column information.
 */
export const DESCRIBE_TABLE_QUERY = (tableName: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `DESCRIBE ${qualifiedTableName};`;
};
