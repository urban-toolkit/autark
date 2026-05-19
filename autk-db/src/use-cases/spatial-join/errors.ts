/** Custom error types for spatial join operations. */

/**
 * Thrown when a referenced table does not exist in the workspace.
 *
 * @param tableName - name of the table that was not found.
 * @example
 * try {
 *   await useCase.exec({ tableRootName: 'missing' }, [], 'ws');
 * } catch (e) {
 *   if (e instanceof TableNotFoundError) console.log(e.message);
 * }
 */
export class TableNotFoundError extends Error {
  constructor(tableName: string) {
    super(`Table ${tableName} not found`);
    this.name = 'TableNotFoundError';
  }
}

/**
 * Thrown when a table has no geometry column available for spatial operations.
 *
 * @param tableName - name of the table lacking a geometry column.
 * @example
 * try {
 *   await useCase.exec({ tableRootName: 'points' }, tables, 'ws');
 * } catch (e) {
 *   if (e instanceof GeometryColumnNotFoundError) console.log(e.message);
 * }
 */
export class GeometryColumnNotFoundError extends Error {
  constructor(tableName: string) {
    super(`Table ${tableName} does not have a geometry column`);
    this.name = 'GeometryColumnNotFoundError';
  }
}
