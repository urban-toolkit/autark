/**
 * Parameters for polygonizing an OSM surface layer from line geometries into closed polygons.
 */
export interface PolygonizeOsmSurfaceParams {
  /** Name of the surface table containing line geometries. */
  surfaceTableName: string;
  /** Optional workspace name. Defaults to `autk`. */
  workspace?: string;
}
