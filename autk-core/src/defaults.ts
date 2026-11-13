/**
 * Shared default CRS for database workspaces and map layers whose CRS is omitted.
 * World Mercator keeps stored geometries and tile rendering in the same projected coordinates.
 */
export const DEFAULT_WORKSPACE_COORDINATE_FORMAT = 'EPSG:3395';
