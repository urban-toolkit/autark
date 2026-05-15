export const DROP_TABLE_QUERY = (tableName: string, workspace: string): string => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `DROP TABLE IF EXISTS ${qualifiedTableName};`;
};
