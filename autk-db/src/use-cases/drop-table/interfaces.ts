/**
 * Parameters for dropping a table from a workspace.
 */
export interface DropTableParams {
  /** Name of the table to drop. Must exist in the target workspace. */
  tableName: string;
  /** Optional workspace (schema) name; defaults to `autk` if omitted. */
  workspace?: string;
}
