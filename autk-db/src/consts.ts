/**
 * Default workspace name assigned when callers do not provide one explicitly.
 *
 * This becomes the initial schema identifier used by `AutkDb` for table registration and queries.
 */
export const DEFAULT_WORKSPACE_NAME = 'autk';

/**
 * Default source coordinate reference system for loaded datasets.
 *
 * Assumes incoming data is expressed as WGS84 longitude and latitude coordinates.
 */
export const DEFAULT_INPUT_COORDINATE_FORMAT = 'EPSG:4326';

/**
 * Default workspace coordinate reference system for stored geometries.
 *
 * Uses World Mercator so spatial operations can work against a consistent projected CRS.
 */
export const DEFAULT_WORKSPACE_COORDINATE_FORMAT = 'EPSG:3395';

/**
 * Default geometry column name used for generated point tables.
 *
 * Provides a stable column name for internal SQL and downstream consumers.
 */
export const DEFAULT_GEO_COLUMN_NAME = 'geoPoint';

/**
 * OSM `leisure` tag values treated as park-like features.
 *
 * Shared by Overpass queries and SQL filters so park classification stays consistent across loading and querying.
 */
export const PARKS_LEISURE_VALUES = ['dog_park', 'park', 'playground', 'recreation_ground'] as const;

/**
 * OSM `landuse` tag values treated as park or green-space features.
 *
 * Centralizes park-related landuse categories used during OSM layer extraction.
 */
export const PARKS_LANDUSE_VALUES = ['wood', 'grass', 'forest', 'orchard', 'village_green', 'vineyard', 'cemetery', 'meadow'] as const;

/**
 * OSM `natural` tag values treated as park or vegetated open-space features.
 *
 * Complements `PARKS_LEISURE_VALUES` and `PARKS_LANDUSE_VALUES` when classifying green areas.
 */
export const PARKS_NATURAL_VALUES = ['wood', 'grass', 'grassland', 'forest', 'scrub', 'heath', 'meadow'] as const;

/**
 * OSM `natural` tag values treated as water features.
 *
 * Used to identify natural water bodies and wetlands during OSM processing.
 */
export const WATER_NATURAL_VALUES = ['water', 'wetland', 'strait', 'spring'] as const;

/**
 * OSM feature values treated as named or artificial water bodies.
 *
 * Extends water classification beyond the `natural` tag alone.
 */
export const WATER_FEATURE_VALUES = ['pond', 'reservoir', 'lagoon', 'stream_pool', 'lake', 'pool', 'canal', 'river'] as const;

/**
 * OSM road values excluded from road layer generation.
 *
 * Filters out pedestrian-only, temporary, and non-road-like highway categories that should not appear in road analyses.
 */
export const EXCLUDED_ROADS_VALUES = ['cycleway', 'elevator', 'footway', 'steps', 'pedestrian', 'proposed', 'construction', 'abandoned', 'platform', 'raceway'] as const;

/**
 * OSM building values excluded from building layer generation.
 *
 * Removes minor service structures and auxiliary buildings from default building extraction.
 */
export const EXCLUDED_BUILDING_VALUES = ['shed', 'garage', 'garages', 'carport', 'hut', 'kiosk', 'toilets', 'service', 'transformer_tower', 'sty', 'container'] as const;
