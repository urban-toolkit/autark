/**
 * Parameters for the OSM building processing use case.
 */
export interface ProcessOsmBuildingsParams {
  /** Name of the OSM buildings table. */
  tableName: string;
  /** Optional workspace name. Defaults to `autk`. */
  workspace?: string;
}
