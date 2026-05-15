/** Default source/input CRS for loaded datasets (WGS84 lat/lng). */
export const DEFAULT_INPUT_COORDINATE_FORMAT = 'EPSG:4326';
/** Default target/workspace CRS for stored geometries (World Mercator). */
export const DEFAULT_WORKSPACE_COORDINATE_FORMAT = 'EPSG:3395';
/** Default geometry column name for point-based tables. */
export const DEFAULT_GEO_COLUMN_NAME = 'geoPoint';

/**
 * OSM tag value definitions used across Overpass queries and layer classification.
 *
 * Centralized here so both the Overpass query builder and the SQL layer filters
 * reference the same source of truth.
 */

export const PARKS_LEISURE_VALUES = ['dog_park', 'park', 'playground', 'recreation_ground'] as const;
export const PARKS_LANDUSE_VALUES = ['wood', 'grass', 'forest', 'orchard', 'village_green', 'vineyard', 'cemetery', 'meadow'] as const;
export const PARKS_NATURAL_VALUES = ['wood', 'grass', 'grassland', 'forest', 'scrub', 'heath', 'meadow'] as const;

export const WATER_NATURAL_VALUES = ['water', 'wetland', 'strait', 'spring'] as const;
export const WATER_FEATURE_VALUES = ['pond', 'reservoir', 'lagoon', 'stream_pool', 'lake', 'pool', 'canal', 'river'] as const;

export const EXCLUDED_ROADS_VALUES = ['cycleway', 'elevator', 'footway', 'steps', 'pedestrian', 'proposed', 'construction', 'abandoned', 'platform', 'raceway'] as const;
export const EXCLUDED_BUILDING_VALUES = ['shed', 'garage', 'garages', 'carport', 'hut', 'kiosk', 'toilets', 'service', 'transformer_tower', 'sty', 'container'] as const;
