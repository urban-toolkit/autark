/**
 * Parameters for computing the OSM bounding box.
 */
export interface GetOsmBboxParams {
  /** Name of the OSM boundaries table. */
  osmTableName: string;
  /** Optional workspace name. Defaults to `autk`. */
  workspace?: string;
  /** Target CRS. Defaults to EPSG:4326 (no transformation). */
  coordinateFormat?: string;
}
