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
  FROM '${fileName}';
`;
};
