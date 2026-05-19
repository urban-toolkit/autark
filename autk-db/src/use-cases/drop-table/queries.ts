/**
 * Builds a SQL statement to drop a table if it exists.
 *
 * @param tableName - Name of the table to drop.
 * @param workspace - Workspace (schema) name containing the table.
 * @returns The `DROP TABLE IF EXISTS` SQL string with a qualified table name.
 */
export const DROP_TABLE_QUERY = (tableName: string, workspace: string): string => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `DROP TABLE IF EXISTS ${qualifiedTableName};`;
};
