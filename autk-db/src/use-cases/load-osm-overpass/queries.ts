/**
 * SQL to create the normalized OSM elements table used by the import pipeline.
 *
 * @param tableName - Desired target table name (unqualified).
 * @param workspace - Workspace (schema) to host the table.
 * @returns A SQL string creating the OSM table schema.
 */
export const CREATE_OSM_TABLE_QUERY = (tableName: string, workspace: string): string => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
  CREATE OR REPLACE TABLE ${qualifiedTableName} (
    kind VARCHAR,
    id BIGINT,
    tags MAP(VARCHAR, VARCHAR),
    refs BIGINT[],
    lat DOUBLE,
    lon DOUBLE,
    ref_roles VARCHAR[],
    ref_types VARCHAR[]
  );
`;
};

/**
 * Generates an INSERT statement that populates the normalized OSM table from a JSON VFS file.
 *
 * @param tableName - Target table name (unqualified).
 * @param fileName - VFS path of the registered JSON file containing OSM elements.
 * @param workspace - Workspace (schema) name.
 * @param ignoreTags - When true, skips mapping tags to a map (sets tags NULL).
 * @returns A SQL string to insert parsed records from the file into the table.
 */
export const INSERT_OSM_DATA_QUERY = (tableName: string, fileName: string, workspace: string, ignoreTags: boolean = false): string => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
  INSERT INTO ${qualifiedTableName} 
  SELECT 
    kind::VARCHAR,
    id::BIGINT,
    ${
      ignoreTags
        ? 'NULL'
        : `CASE 
      WHEN tags IS NULL OR tags = [] THEN NULL
      ELSE map_from_entries(tags)
    END`
    } AS tags,
    refs::BIGINT[],
    lat::DOUBLE,
    lon::DOUBLE,
    ref_roles::VARCHAR[],
    ref_types::VARCHAR[]
  FROM read_json('${fileName}', format = 'array', columns = ${OSM_JSON_COLUMNS});
`;
};

/**
 * The record types, given rather than detected: detection reads a sample of the
 * first records, and a file that starts with thousands of nodes (empty `refs`,
 * `ref_roles` and `ref_types`) would type those columns wrong for the ways and
 * relations after it.
 */
const OSM_JSON_COLUMNS = `{
    kind: 'VARCHAR',
    id: 'BIGINT',
    tags: 'STRUCT(k VARCHAR, v VARCHAR)[]',
    refs: 'BIGINT[]',
    lat: 'DOUBLE',
    lon: 'DOUBLE',
    ref_roles: 'VARCHAR[]',
    ref_types: 'VARCHAR[]'
  }`;
